import { getPackageData } from '@U/package-registry.utils';
import { getCleanVersion } from '@U/version.utils';
import { getLogger } from '@U/index';
import { getOpenAIService } from '@S/openai.service';
import { ConflictAnalysis, PackageVersionRankRegistryData, RegistryData } from '@I/index';
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

        // Get rankings for all packages in parallel
        const rankingPromises = Array.from(currentAnalysis.allPackagesMentionedInError).map(async (packageInfo) => {
            // Extract dependency context for this package
            const ranking = await getRankingForPackage(packageInfo.name);
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
export async function getRankingForPackage(packageName: string): Promise<{ rank: number; tier: string } | null> {
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
        const rankingPrompt = createPackageRankingPrompt(packageName, readme?.readme?.trim() && readme?.readme?.trim().length > 0 ? JSON.stringify(readme?.readme) : undefined);

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
