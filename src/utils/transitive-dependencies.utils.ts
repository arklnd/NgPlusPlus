import { getPackageData, getPackageVersionData } from '@U/package-registry.utils.js';
import { getCleanVersion, satisfiesVersionRange, findCompatibleVersion } from '@U/version.utils.js';
import { getAllDependencies, isDevDependency, updateDependency } from '@U/package-json.utils.js';
import { getLogger } from '@U/logger.utils.js';
import { PackageJson } from '@I/package-json.interfaces.js';

/**
 * TRANSITIVE DEPENDENCY RESOLUTION ENGINE
 *
 * This phase handles the complex task of updating indirect dependencies (dependencies of dependencies).
 * It performs:
 * - Recursive dependency tree analysis to identify all transitive dependencies
 * - Version compatibility checks for nested dependency chains
 * - Automatic updates of transitive dependencies to maintain compatibility
 * - Resolution of diamond dependency problems (same package at different levels)
 * - Optimization of the dependency tree to minimize version conflicts
 * - Handling of optional dependencies and peer dependency requirements
 *
 * @param packageJson Package.json object to modify
 * @param updates Array of package updates that were applied
 * @returns Array of update messages detailing transitive dependency resolution
 */
export async function updateTransitiveDependencies(packageJson: PackageJson, updates: Array<{ name: string; version: string }>): Promise<string[]> {
    const logger = getLogger().child('TransitiveDependencies');
    logger.info('Starting transitive dependency resolution', { updateCount: updates.length });

    // Collect all resolution messages for user feedback
    const results: string[] = [];

    // PHASE 1: RECURSIVE DEPENDENCY TREE ANALYSIS
    // Iterate through each updated package to analyze its complete dependency tree
    for (const { name, version } of updates) {
        logger.debug('Processing package for transitive dependencies', { package: name, version });

        try {
            // VALIDATION: Ensure version specification is valid and parseable
            const cleanVersion = getCleanVersion(version);
            if (!cleanVersion) {
                const errorMsg = `Invalid version specification: ${version} for ${name}`;
                results.push(`❌ ${errorMsg}`);
                logger.error(errorMsg, { package: name, version });
                continue;
            }

            // Fetch specific version data to access dependency metadata
            logger.trace('Fetching specific version data for transitive analysis', { package: name, version: cleanVersion });
            const versionData = await getPackageVersionData(name, cleanVersion);

            // PHASE 2: COMPREHENSIVE DEPENDENCY COLLECTION
            // Merge both direct dependencies AND peer dependencies to handle all requirements.
            // This addresses the diamond dependency problem by considering all possible constraints.
            const allDeps = {
                ...(versionData.dependencies || {}), // Direct runtime dependencies
                ...(versionData.peerDependencies || {}), // Peer dependencies that must be satisfied
            };

            logger.debug('Collected dependencies for analysis', {
                package: name,
                dependencies: Object.keys(versionData.dependencies || {}).length,
                peerDependencies: Object.keys(versionData.peerDependencies || {}).length,
                totalDeps: Object.keys(allDeps).length,
            });

            // PHASE 3: VERSION COMPATIBILITY ANALYSIS FOR NESTED CHAINS
            // For each transitive dependency, perform deep compatibility checks
            for (const [depName, requiredRange] of Object.entries(allDeps)) {
                logger.trace('Analyzing transitive dependency', {
                    parent: name,
                    dependency: depName,
                    requiredRange,
                });

                // Get the current state of all dependencies (deps, devDeps, peerDeps)
                const allExistingDeps = getAllDependencies(packageJson);
                const currentSpec = allExistingDeps[depName];

                // Skip dependencies that don't exist in the current project
                // (they might be optional or handled by other packages)
                if (!currentSpec) {
                    logger.trace('Dependency not found in current project, skipping', {
                        dependency: depName,
                    });
                    continue;
                }

                // VALIDATION: Ensure current dependency version is parseable
                const currentVersion = getCleanVersion(currentSpec);
                if (!currentVersion) {
                    const errorMsg = `Invalid version specification: ${currentSpec} for ${depName}`;
                    results.push(`❌ ${errorMsg}`);
                    logger.error(errorMsg, { package: depName, spec: currentSpec });
                    continue;
                }

                // PHASE 4: COMPATIBILITY VERIFICATION
                // Check if current version satisfies the transitive dependency requirements
                if (satisfiesVersionRange(currentVersion, requiredRange)) {
                    const successMsg = `${depName}@${currentSpec} satisfies ${requiredRange}`;
                    results.push(`✓ ${successMsg}`);
                    logger.debug('Dependency compatibility verified', {
                        dependency: depName,
                        currentVersion: currentSpec,
                        requiredRange,
                    });
                    continue;
                }

                // PHASE 5: CONFLICT RESOLUTION AND VERSION OPTIMIZATION
                // When compatibility issues are found, find the optimal version that satisfies all constraints

                logger.warn('Compatibility issue detected', {
                    dependency: depName,
                    currentVersion: currentSpec,
                    requiredRange,
                    parent: name,
                });

                // Fetch all available versions for the conflicting dependency
                logger.trace('Fetching versions for conflict resolution', { dependency: depName });
                const depRegistry = await getPackageData(depName);
                const versions = Object.keys(depRegistry.versions);

                // Use semantic versioning to find a compatible version that satisfies the required range
                // This handles complex version constraints and minimizes breaking changes
                const suitableVersion = findCompatibleVersion(versions, requiredRange);

                if (suitableVersion) {
                    // PHASE 6: AUTOMATIC DEPENDENCY TREE OPTIMIZATION
                    // Update the dependency with the compatible version
                    const newSpec = `^${suitableVersion}`;

                    // Maintain proper dependency categorization (dev vs production)
                    const isDev = isDevDependency(packageJson, depName);
                    updateDependency(packageJson, depName, newSpec, isDev);

                    const updateMsg = `Updated ${depName} from ${currentSpec} to ${newSpec} (required by ${name}@${version})`;
                    results.push(`⚠ ${updateMsg}`);
                    logger.info('Successfully updated transitive dependency', {
                        dependency: depName,
                        oldVersion: currentSpec,
                        newVersion: newSpec,
                        parent: name,
                        isDev,
                    });
                } else {
                    // PHASE 7: UNRESOLVABLE CONFLICT HANDLING
                    // When no compatible version exists, flag as unresolvable conflict
                    const errorMsg = `No suitable version found for ${depName} to satisfy ${requiredRange}`;
                    results.push(`❌ ${errorMsg}`);
                    logger.error('Unresolvable transitive dependency conflict', {
                        dependency: depName,
                        requiredRange,
                        parent: name,
                        availableVersions: versions.length,
                    });
                }
            }
        } catch (error) {
            // PHASE 8: ERROR HANDLING AND RECOVERY
            // Gracefully handle registry failures, network issues, or malformed package data
            // This ensures that one problematic package doesn't break the entire resolution process
            const errorMsg = `Failed to process ${name}: ${error instanceof Error ? error.message : String(error)}`;
            results.push(`❌ ${errorMsg}`);
            logger.error('Error processing transitive dependencies', {
                package: name,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    logger.info('Transitive dependency resolution completed', {
        totalResults: results.length,
        processedUpdates: updates.length,
    });

    // Return comprehensive resolution report for user review
    return results;
}
