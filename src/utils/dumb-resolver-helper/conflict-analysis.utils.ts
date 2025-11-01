import { getPackageData } from '@U/package-registry.utils';
import { getCleanVersion } from '@U/version.utils';
import { getLogger } from '@U/index';
import { getOpenAIService } from '@S/openai.service';
import { ConflictAnalysis, RegistryData } from '@I/index';
import { createDependencyParsingPrompt, createPackageRankingPrompt } from './template-generator.utils';
import { getCachedPackageData, setCachedPackageData } from '@U/cache.utils';
import * as semver from 'semver';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/**
 * Parses install error output and generates initial conflict analysis using AI
 *
 * @param installError - The error output from npm install failure
 * @returns Initial conflict analysis parsed from the error
 */
export async function parseInstallErrorToConflictAnalysis(installError: string): Promise<ConflictAnalysis> {
    const logger = getLogger().child('conflict-analysis');
    const openai = getOpenAIService({ baseURL: 'http://localhost:3000/v1/', maxTokens: 10000, timeout: 300000 });

    logger.info('Parsing install error to generate conflict analysis');

    // Create parsing prompt for AI
    const parsingPrompt = createDependencyParsingPrompt(installError);

    // Analyze the error output for constraints and blockers
    let parsingResponse = await openai.generateText(parsingPrompt);
    parsingResponse = parsingResponse.trim();
    let jsonString = parsingResponse.trim();

    const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
    if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
    }

    try {
        const parsed = JSON.parse(jsonString);

        if (parsed.conflicts && Array.isArray(parsed.conflicts) && parsed.conflicts.length > 0) {
            const primaryConflict = parsed.conflicts[0];
            const currentAnalysis: ConflictAnalysis = {
                conflicts: parsed.conflicts,
                allPackagesMentionedInError: parsed.conflicts.map((c: any) => c.packageName),
                conflictingPackage: primaryConflict.packageName,
                conflictingPackageCurrentVersion: primaryConflict.currentVersion,
                satisfyingPackages: primaryConflict.requiredBy
                    .filter((r: any) => r.isSatisfied)
                    .map((r: any) => ({
                        packageName: r.dependent,
                        packageVersion: r.dependentVersion || '',
                        requiredVersionRange: r.requiredRange,
                        rank: undefined,
                        tier: undefined,
                        availableVersions: [],
                    })),
                notSatisfying: primaryConflict.requiredBy
                    .filter((r: any) => !r.isSatisfied)
                    .map((r: any) => ({
                        packageName: r.dependent,
                        packageVersion: r.dependentVersion || '',
                        requiredVersionRange: r.requiredRange,
                        rank: undefined,
                        tier: undefined,
                        availableVersions: [],
                    })),
                rank: 0,
                tier: '',
                packagesVersionData: new Map<string, string[]>(),
            };

            logger.info('🌟 Successfully parsed install error to conflict analysis', {
                conflictingPackage: currentAnalysis.conflictingPackage,
                conflictingPackageCurrentVersion: currentAnalysis.conflictingPackageCurrentVersion,
                satisfyingPackagesCount: currentAnalysis.satisfyingPackages?.length || 0,
                notSatisfyingPackagesCount: currentAnalysis.notSatisfying?.length || 0,
                totalConflicts: currentAnalysis.conflicts.length,
            });

            return currentAnalysis;
        } else {
            throw new Error('Invalid response format: missing or invalid conflicts array');
        }
    } catch (parseError) {
        logger.error('Failed to parse AI response as JSON', {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            response: jsonString,
        });

        // Return empty analysis as fallback
        return {
            conflicts: [],
            allPackagesMentionedInError: [],
            conflictingPackage: '',
            conflictingPackageCurrentVersion: '',
            satisfyingPackages: [],
            notSatisfying: [],
            rank: 0,
            tier: '',
            packagesVersionData: new Map<string, string[]>(),
        };
    }
}

/**
 * Enhances conflict analysis with available versions from the npm registry
 * Fetches available versions for all packages involved in the conflict and hydrates the analysis object
 *
 * @param currentAnalysis - The base conflict analysis to enhance
 * @returns Enhanced conflict analysis with available versions populated
 */
export async function hydrateConflictAnalysisWithRegistryData(currentAnalysis: ConflictAnalysis): Promise<ConflictAnalysis> {
    const logger = getLogger().child('conflict-analysis');

    logger.info('Fetching available versions for packages involved in conflict');

    try {
        // Get unique package names involved in the conflict
        const packagesToFetch = new Map<string, string>();

        // Add conflicting package
        if (currentAnalysis.conflictingPackage) {
            packagesToFetch.set(currentAnalysis.conflictingPackage, currentAnalysis.conflictingPackageCurrentVersion);
        }

        // Add satisfying packages
        currentAnalysis.satisfyingPackages?.forEach((pkg) => {
            if (pkg.packageName) {
                packagesToFetch.set(pkg.packageName, pkg.packageVersion);
            }
        });

        // Add non-satisfying packages
        currentAnalysis.notSatisfying?.forEach((pkg) => {
            if (pkg.packageName) {
                packagesToFetch.set(pkg.packageName, pkg.packageVersion);
            }
        });

        // Fetch available versions for all packages in parallel
        const versionFetchPromises = Array.from(packagesToFetch).map(async ([packageName, currentVersion]) => {
            try {
                logger.debug('Fetching available versions for package', { package: packageName });
                const registryData = packageName.trim() === 'root project' ? { versions: [] } : await getPackageData(packageName);
                const allVersions = registryData.versions || [];

                // Filter to only include versions newer than current version
                const cleanCurrentVersion = getCleanVersion(currentVersion);
                let versions = allVersions;

                if (cleanCurrentVersion) {
                    versions = allVersions.filter((version) => {
                        try {
                            return semver.gt(version, cleanCurrentVersion);
                        } catch (error) {
                            logger.warn('Failed to compare versions', {
                                package: packageName,
                                version,
                                currentVersion,
                                error: error instanceof Error ? error.message : String(error),
                            });
                            return false;
                        }
                    });

                    logger.debug('Filtered versions to newer ones only', {
                        package: packageName,
                        currentVersion,
                        totalVersions: allVersions.length,
                        newerVersions: versions.length,
                    });
                } else {
                    logger.warn('Could not parse current version, using all available versions', {
                        package: packageName,
                        currentVersion,
                    });
                }

                logger.trace('Fetched newer versions for package', { package: packageName, versionCount: versions.length });
                return { packageName, versions };
            } catch (error) {
                logger.warn('Failed to fetch versions for package', {
                    package: packageName,
                    error: error instanceof Error ? error.message : String(error),
                });
                return { packageName, versions: [] };
            }
        });

        const versionResults = await Promise.all(versionFetchPromises);
        const packageVersionMap = new Map(versionResults.map((result) => [result.packageName, result.versions]));

        // Create enhanced analysis object
        const enhancedAnalysis: ConflictAnalysis = {
            ...currentAnalysis,
            packagesVersionData: packageVersionMap,
            // Hydrate conflicting package with available versions
            conflictingPackageAvailableVersions: currentAnalysis.conflictingPackage && packageVersionMap.has(currentAnalysis.conflictingPackage) ? packageVersionMap.get(currentAnalysis.conflictingPackage) : currentAnalysis.conflictingPackageAvailableVersions,

            // Hydrate satisfying packages with available versions
            satisfyingPackages:
                currentAnalysis.satisfyingPackages?.map((pkg) => ({
                    ...pkg,
                    availableVersions: packageVersionMap.get(pkg.packageName) || [],
                })) || [],

            // Hydrate non-satisfying packages with available versions
            notSatisfying:
                currentAnalysis.notSatisfying?.map((pkg) => ({
                    ...pkg,
                    availableVersions: packageVersionMap.get(pkg.packageName) || [],
                })) || [],
        };

        logger.info('Successfully hydrated conflict analysis with available versions', {
            conflictingPackage: enhancedAnalysis.conflictingPackage,
            conflictingPackageVersionCount: enhancedAnalysis.conflictingPackageAvailableVersions?.length || 0,
            satisfyingPackagesCount: enhancedAnalysis.satisfyingPackages?.length || 0,
            notSatisfyingPackagesCount: enhancedAnalysis.notSatisfying?.length || 0,
            totalPackagesFetched: packagesToFetch.size,
        });

        return enhancedAnalysis;
    } catch (error) {
        logger.error('Failed to hydrate conflict analysis with registry data', {
            error: error instanceof Error ? error.message : String(error),
        });
        // Return original analysis if registry fetch fails
        return currentAnalysis;
    }
}

/**
 * Hydrates conflict analysis with package ranking information using AI
 * Processes each package individually through AI to get ranking, then manually hydrates the results
 *
 * @param currentAnalysis - The conflict analysis to enhance with ranking
 * @returns Enhanced conflict analysis with ranking information
 */
export async function hydrateConflictAnalysisWithRanking(currentAnalysis: ConflictAnalysis): Promise<ConflictAnalysis> {
    const logger = getLogger().child('conflict-analysis-ranking');

    logger.info('Adding ranking information to conflict analysis using AI for individual packages');

    try {
        // Collect all unique package names to rank
        const packagesToRank = new Set<string>();

        // Add conflicting package
        if (currentAnalysis.conflictingPackage) {
            packagesToRank.add(currentAnalysis.conflictingPackage);
        }

        // Add packages from satisfying packages
        currentAnalysis.satisfyingPackages?.forEach((pkg) => {
            if (pkg.packageName) {
                packagesToRank.add(pkg.packageName);
            }
        });

        // Add packages from non-satisfying packages
        currentAnalysis.notSatisfying?.forEach((pkg) => {
            if (pkg.packageName) {
                packagesToRank.add(pkg.packageName);
            }
        });

        logger.info('Ranking packages individually', { totalPackages: packagesToRank.size });

        // Get rankings for all packages in parallel
        const rankingPromises = Array.from(packagesToRank).map(async (packageName) => {
            // Extract dependency context for this package
            const dependencyContext = extractDependencyContext(currentAnalysis, packageName);
            const ranking = await getRankingForPackage(packageName, dependencyContext);
            return { packageName, ranking };
        });

        const rankingResults = await Promise.all(rankingPromises);
        const packageRankingMap = new Map<string, { rank: number; tier: string }>();

        // Build ranking map
        rankingResults.forEach(({ packageName, ranking }) => {
            if (ranking) {
                packageRankingMap.set(packageName, ranking);
            }
        });

        if (currentAnalysis.conflictingPackage && packageRankingMap.has(currentAnalysis.conflictingPackage) && packageRankingMap.get(currentAnalysis.conflictingPackage)?.rank === undefined) {
            throw new Error('‼️Conflicting package ranking is undefined');
        }

        // Create enhanced analysis with ranking information manually hydrated
        const enhancedAnalysis: ConflictAnalysis = {
            ...currentAnalysis,

            // Hydrate conflicting package with ranking information
            rank: packageRankingMap.get(currentAnalysis.conflictingPackage)!.rank,
            tier: currentAnalysis.conflictingPackage && packageRankingMap.has(currentAnalysis.conflictingPackage) ? packageRankingMap.get(currentAnalysis.conflictingPackage)!.tier : 'UNRANKED',

            // Hydrate satisfying packages with ranking information
            satisfyingPackages:
                currentAnalysis.satisfyingPackages?.map((pkg) => {
                    const ranking = packageRankingMap.get(pkg.packageName);
                    return {
                        ...pkg,
                        rank: ranking?.rank,
                        tier: ranking?.tier,
                    };
                }) || [],

            // Hydrate non-satisfying packages with ranking information
            notSatisfying:
                currentAnalysis.notSatisfying?.map((pkg) => {
                    const ranking = packageRankingMap.get(pkg.packageName);
                    return {
                        ...pkg,
                        rank: ranking?.rank,
                        tier: ranking?.tier,
                    };
                }) || [],
        };

        const rankedPackagesCount = Array.from(packageRankingMap.keys()).length;

        logger.info('Successfully added ranking information to conflict analysis', {
            conflictingPackage: enhancedAnalysis.conflictingPackage,
            satisfyingPackagesCount: enhancedAnalysis.satisfyingPackages?.length || 0,
            notSatisfyingPackagesCount: enhancedAnalysis.notSatisfying?.length || 0,
            totalPackagesRanked: rankedPackagesCount,
            rankingsApplied: true,
        });

        return enhancedAnalysis;
    } catch (error) {
        logger.error('Failed to add ranking information to conflict analysis', {
            error: error instanceof Error ? error.message : String(error),
        });
        // Return original analysis if AI ranking fails
        return currentAnalysis;
    }
}

/**
 * Extract dependency context for a package from conflict analysis
 */
function extractDependencyContext(analysis: ConflictAnalysis, packageName: string): any {
    const context: any = {
        dependents: [],
        isPrimaryConflict: analysis.conflictingPackage === packageName,
        ecosystem: extractEcosystem(packageName),
    };

    // Find all packages that depend on this package
    analysis.conflicts.forEach(conflict => {
        conflict.requiredBy.forEach(req => {
            if (req.dependent === packageName) {
                context.dependents.push({
                    dependentPackage: conflict.packageName,
                    requiredRange: req.requiredRange,
                    type: req.type,
                    isSatisfied: req.isSatisfied,
                    rank: getPackageRank(analysis, conflict.packageName),
                });
            }
        });
    });

    // Check if root project depends on this package
    const rootDeps = analysis.notSatisfying?.filter(pkg => pkg.packageName === 'root project') || [];
    if (rootDeps.length > 0) {
        context.rootDependency = true;
    }

    return context;
}

/**
 * Extract ecosystem information from package name
 */
function extractEcosystem(packageName: string): string {
    if (packageName.startsWith('@angular/')) return 'angular';
    if (packageName.startsWith('@hylandsoftware/')) return 'hyland';
    if (packageName.startsWith('react')) return 'react';
    if (packageName.startsWith('vue')) return 'vue';
    if (packageName.startsWith('@nestjs/')) return 'nestjs';
    return 'general';
}

/**
 * Get package rank from analysis
 */
function getPackageRank(analysis: ConflictAnalysis, packageName: string): number {
    if (analysis.conflictingPackage === packageName) return analysis.rank;
    const satisfying = analysis.satisfyingPackages?.find(p => p.packageName === packageName);
    if (satisfying?.rank) return satisfying.rank;
    const notSatisfying = analysis.notSatisfying?.find(p => p.packageName === packageName);
    if (notSatisfying?.rank) return notSatisfying.rank;
    return 0;
}

/**
 * Get ranking for a single package using AI with caching support
 */
export async function getRankingForPackage(packageName: string, dependencyContext?: any): Promise<{ rank: number; tier: string } | null> {
    if (packageName.trim() === 'root project') {
        return { rank: 999999, tier: 'ROOT' };
    }
    const logger = getLogger().child('package-ranking');
    const cacheKey = `ranking:${packageName}`;

    try {
        // Check cache first
        const cachedRanking = getCachedPackageData(cacheKey);
        if (cachedRanking) {
            logger.debug('Retrieved ranking from cache', {
                package: packageName,
                rank: cachedRanking.rank,
                tier: cachedRanking.tier,
            });
            return cachedRanking;
        }

        logger.debug('Cache miss, getting ranking from AI for package', { package: packageName });

        const readme: RegistryData | null = packageName.trim() !== 'root project' ? await getPackageData(packageName, ['readme']) : null;

        const openai = getOpenAIService({ baseURL: 'http://localhost:3000/v1/', maxTokens: 10000, timeout: 300000 });

        // Create ranking prompt for this specific package
        const rankingPrompt = createPackageRankingPrompt(packageName, readme?.readme?.trim() && readme?.readme?.trim().length > 0 ? JSON.stringify(readme?.readme) : undefined, dependencyContext);

        // Get AI response for this package
        let rankingResponse = await openai.generateText(rankingPrompt);
        rankingResponse = rankingResponse.trim();
        let jsonString = rankingResponse.trim();

        const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
        if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
        }

        const ranking = JSON.parse(jsonString);

        if (ranking && typeof ranking.rank === 'number' && typeof ranking.tier === 'string') {
            const rankingResult = { rank: ranking.rank, tier: ranking.tier };

            // Cache the successful result for 24 hours (1440 minutes)
            // Package rankings don't change frequently, so longer TTL is appropriate
            setCachedPackageData(cacheKey, rankingResult, 1440);

            logger.debug('Successfully got ranking for package and cached result', {
                package: packageName,
                rank: ranking.rank,
                tier: ranking.tier,
            });
            return rankingResult;
        } else {
            logger.warn('Invalid ranking response format for package', {
                package: packageName,
                response: jsonString,
            });
            return null;
        }
    } catch (error) {
        logger.warn('Failed to get ranking for package', {
            package: packageName,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
