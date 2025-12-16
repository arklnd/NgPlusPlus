import { getPackageData } from '@U/package-registry.utils';
import { getCleanVersion } from '@U/version.utils';
import { ConflictDetail, ERESOLVErrorInfo, getLogger, getPackageDependents, RequiredBy } from '@U/index';
import { getOpenAIService } from '@S/openai.service';
import { ConflictAnalysis, PackageVersionRankRegistryData, RegistryData } from '@I/index';
import { createDependencyParsingPrompt, createPackageRankingPrompt } from './template-generator.utils';
import { getCachedPackageData, setCachedPackageData } from '@U/cache.utils';
import * as semver from 'semver';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/**
 * Parses an npm ERESOLVE error statically into a structured conflict analysis without AI processing.
 *
 * This function provides a deterministic, fast approach to parsing npm dependency conflicts by directly
 * analyzing the ERESOLV error object structure. It extracts:
 * - The primary conflicted package (name and current version)
 * - All dependents requiring conflicting versions
 * - Dependency types (peer vs regular dependencies)
 * - Whether each requirement is satisfied
 *
 * This is useful for:
 * - Quick initial conflict diagnosis before enhanced AI-powered analysis
 * - Low-latency conflict detection in real-time scenarios
 * - Fallback parsing when AI services are unavailable
 *
 * @param installError - A serialized ERESOLV error object from npm install failure.
 *                       Expected to be a JSON string containing error structure with:
 *                       - `current`: The installed package info
 *                       - `edge`: The conflicting requirement
 *                       - `currentEdge`: Optional additional dependency context
 *
 * @returns A Promise resolving to ConflictAnalysis containing:
 *          - `conflicts`: Array of ConflictDetail objects representing each conflict
 *          - `allPackagesMentionedInError`: Set of all packages involved for downstream processing
 *
 * @throws Will not throw; returns empty analysis on parse failure
 *
 * @example
 * const errorJson = JSON.stringify(eresolveError);
 * const analysis = await parseInstallErrorToConflictAnalysisStatically(errorJson);
 * // Result: { conflicts: [...], allPackagesMentionedInError: [...] }
 *
 * @remarks
 * - Does not require OpenAI or external services
 * - Handles missing or incomplete error structures gracefully
 * - Marks conflicts as unsatisfied and current edges as satisfied
 * - All packages initialized with rank: -1 for later enhancement via hydrateConflictAnalysisWithRanking
 */
export async function parseInstallErrorToConflictAnalysisStatically(installError: string): Promise<ConflictAnalysis> {
    const logger = getLogger().child('conflict-analysis-static');
    const errorObj = JSON.parse(installError) as ERESOLVErrorInfo;

    try {
        const conflicts: ConflictDetail[] = [];
        const allPackagesMentioned = new Set<PackageVersionRankRegistryData>();

        // Extract primary conflict information
        if (errorObj.current && errorObj.edge) {
            const conflictDetail: ConflictDetail = {
                packageName: errorObj.current.name,
                currentVersion: errorObj.current.version,
                requiredBy: [],
            };

            // Add the conflicting requirement
            if (errorObj.edge.from) {
                const requiredBy: RequiredBy = {
                    dependent: errorObj.edge.from.name,
                    dependentVersion: errorObj.edge.from.version,
                    requiredRange: errorObj.edge.spec,
                    type: (errorObj.edge.type || 'dependency') as 'dependency' | 'peer',
                    isSatisfied: false, // This is a conflict, so it's not satisfied
                };
                conflictDetail.requiredBy.push(requiredBy);

                // Track all mentioned packages
                allPackagesMentioned.add({
                    name: errorObj.current.name,
                    currentVersion: errorObj.current.version,
                    rank: -1,
                    tier: 'NONE',
                    packagesVersionData: [],
                });

                allPackagesMentioned.add({
                    name: errorObj.edge.from.name,
                    currentVersion: errorObj.edge.from.version,
                    rank: -1,
                    tier: 'NONE',
                    packagesVersionData: [],
                });
            }

            // If there's a current edge with additional dependency info
            // Current edge represents the currently satisfied dependency, often from root project
            /* if (errorObj.currentEdge) {
                const dependentName = errorObj.currentEdge.from?.name || errorObj.current.whileInstalling?.name || 'root project';
                const dependentVersion = errorObj.currentEdge.from?.version || errorObj.current.whileInstalling?.version || undefined;
                
                // Only add if we have a valid dependent
                if (dependentName) {
                    const additionalRequiredBy: RequiredBy = {
                        dependent: dependentName,
                        dependentVersion: dependentVersion,
                        requiredRange: errorObj.currentEdge.spec,
                        type: (errorObj.currentEdge.type || 'dependency') as 'dependency' | 'peer',
                        isSatisfied: true, // Current edge is satisfied
                    };
                    conflictDetail.requiredBy.push(additionalRequiredBy);

                    allPackagesMentioned.add({
                        name: dependentName,
                        currentVersion: dependentVersion || 'unknown',
                        rank: -1,
                        tier: 'NONE',
                        packagesVersionData: [],
                    });
                }
            } */

            conflicts.push(conflictDetail);
        }

        const analysis: ConflictAnalysis = {
            conflicts,
            allPackagesMentionedInError: Array.from(allPackagesMentioned),
        };

        logger.info('Successfully parsed install error to conflict analysis statically', {
            totalConflicts: analysis.conflicts.length,
            packagesCount: analysis.allPackagesMentionedInError.length,
            primaryConflict: conflicts[0]?.packageName,
        });

        return analysis;
    } catch (error) {
        logger.error('Failed to parse install error statically', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            conflicts: [],
            allPackagesMentionedInError: [],
        };
    }
}

/**
 * Parses install error output and generates initial conflict analysis using AI
 *
 * @param installError - The error output from npm install failure
 * @returns Initial conflict analysis parsed from the error
 */
export async function parseInstallErrorToConflictAnalysis(installError: string): Promise<ConflictAnalysis> {
    const logger = getLogger().child('conflict-analysis');
    const openai = getOpenAIService();

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
            // Collect all unique packages mentioned in the error
            const allPackages = new Set<PackageVersionRankRegistryData>();
            parsed.conflicts.forEach((c: any) => {
                allPackages.add({
                    name: c.packageName,
                    currentVersion: c.currentVersion,
                    rank: -1,
                    tier: 'NONE',
                    packagesVersionData: [],
                });
                c.requiredBy.forEach((r: any) => {
                    allPackages.add({
                        name: r.dependent,
                        currentVersion: r.dependentVersion,
                        rank: -1,
                        tier: 'NONE',
                        packagesVersionData: [],
                    });
                });
            });
            const currentAnalysis: ConflictAnalysis = {
                conflicts: parsed.conflicts,
                allPackagesMentionedInError: Array.from(allPackages),
            };

            logger.info('🌟 Successfully parsed install error to conflict analysis', {
                totalConflicts: currentAnalysis.conflicts.length,
                allPackagesMentionedInErrorCount: currentAnalysis.allPackagesMentionedInError.length,
                primaryConflictPackage: parsed.conflicts[0]?.packageName,
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
        // Fetch available versions for all packages in parallel
        const versionFetchPromises = Array.from(currentAnalysis.allPackagesMentionedInError).map(async (pkg) => {
            const packageName = pkg.name;
            const currentVersion = pkg.currentVersion;
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
                    pkg.packagesVersionData = versions;

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
            // allPackagesMentionedInError: currentAnalysis.allPackagesMentionedInError.map((pkg) => ({
            //     ...pkg,
            //     packagesVersionData: packageVersionMap.get(pkg.name) || [],
            // })),
        };

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
        logger.info('Ranking packages individually', { totalPackages: currentAnalysis.allPackagesMentionedInError.length });
        // Get dependents for all packages mentioned in error
        const dependentsMap: Record<string, Array<{ name: string; version: string }>> = {};
        for (const pkg of currentAnalysis.allPackagesMentionedInError) {
            const dependents = getPackageDependents(pkg.name);
            dependentsMap[pkg.name] = dependents || [];
        }

        // Get rankings for all packages in parallel
        const rankingPromises = Array.from(currentAnalysis.allPackagesMentionedInError).map(async (packageInfo) => {
            // Extract dependency context for this package
            const ranking = await getRankingForPackage(packageInfo.name, dependentsMap);
            packageInfo.rank = ranking ? ranking.rank : -1;
            packageInfo.tier = ranking ? ranking.tier : 'UNRANKED';
            return { packageName: packageInfo.name, ranking };
        });

        const rankingResults = await Promise.all(rankingPromises);
        const packageRankingMap = new Map<string, { rank: number; tier: string }>();

        // Build ranking map
        rankingResults.forEach(({ packageName, ranking }) => {
            if (ranking) {
                packageRankingMap.set(packageName, ranking);
            }
        });

        const rankedPackagesCount = Array.from(packageRankingMap.keys()).length;

        return currentAnalysis;
    } catch (error) {
        logger.error('Failed to add ranking information to conflict analysis', {
            error: error instanceof Error ? error.message : String(error),
        });
        // Return original analysis if AI ranking fails
        return currentAnalysis;
    }
}

/**
 * Get ranking for a single package using AI with caching support
 */
export async function getRankingForPackage(packageName: string, dependentsMap: Record<string, Array<{ name: string; version: string }>>): Promise<{ rank: number; tier: string } | null> {
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

        const openai = getOpenAIService(); // vscode extension hack আর কাজ করছে না

        // Create ranking prompt for this specific package
        const rankingPrompt = createPackageRankingPrompt(packageName, readme?.readme?.trim() && readme?.readme?.trim().length > 0 ? JSON.stringify(readme?.readme) : undefined, dependentsMap);

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
