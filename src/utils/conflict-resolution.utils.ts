import { getPackageData, getPackageVersionData, getPackageVersions } from '@U/package-registry.utils.js';
import { getCleanVersion, satisfiesVersionRange, findCompatibleVersion } from '@U/version.utils.js';
import { getAllDependencies, getAllDependent, isDevDependency, updateDependency, installDependencies } from '@U/package-json.utils.js';
import { getLogger } from '@U/logger.utils.js';
import { ConflictInfo, ConflictResolution } from '@I/conflict-resolution.interfaces.js';
import { PackageJson } from '@I/package-json.interfaces.js';
import { RegistryData } from '@I/package-registry.interfaces.js';

/**
 * Analyzes potential conflicts between existing dependencies and planned updates
 * @param packageJson Current package.json content
 * @param plannedUpdates Array of planned dependency updates
 * @returns Conflict analysis results
 */
export async function analyzeConflicts(repoPath: string, runNpmInstall: boolean, packageJson: PackageJson, plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>): Promise<ConflictResolution> {
    const logger = getLogger().child('ConflictResolution');
    logger.info('Starting conflict analysis', { plannedUpdateCount: plannedUpdates.length });

    // #region Dependency Installation for Conflict Analysis
    // Before starting conflict analysis, ensure installDependencies has been run to populate node_modules
    if (runNpmInstall) {
        try {
            logger.debug('Installing dependencies to populate node_modules for conflict analysis');
            await installDependencies(repoPath);
            logger.info('Successfully installed dependencies before conflict analysis');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to install dependencies before conflict analysis - aborting', {
                error: errorMessage,
            });
            throw new Error(`Cannot perform conflict analysis: dependency installation failed - ${errorMessage}`);
        }
    }
    // #endregion

    const conflicts: ConflictInfo[] = [];
    const resolutions: string[] = [];

    for (const { name: updateName, version: plannedVersion } of plannedUpdates) {
        logger.debug('Analyzing conflicts for package update', {
            package: updateName,
            version: plannedVersion,
        });

        try {
            // Get current version of the package being updated from package.json
            const currentVersion = (packageJson.dependencies ?? {})[updateName];

            if (!currentVersion) {
                logger.trace('Package not found in current dependencies, skipping conflict analysis', {
                    package: updateName,
                });
                continue;
            }

            // Use getAllDependent to find packages that depend on the current version of updateName
            const dependents = await getAllDependent(repoPath, updateName);

            logger.trace('Found dependents for package', {
                package: updateName,
                currentVersion,
                dependentVersions: Object.keys(dependents),
                totalDependents: Object.values(dependents).reduce((sum, arr) => sum + arr.length, 0),
            });

            // Flatten all dependent packages for easier processing
            const allDependentPackages = Object.entries(dependents).flatMap(([dependentOnVersion, dependentPackages]) => dependentPackages.map((dependent) => ({ ...dependent, dependentOnVersion })));

            // Check each dependent package to see if it has peer dependency requirements
            for (const dependent of allDependentPackages) {
                try {
                    logger.trace('Checking dependent package', {
                        dependent: dependent.name,
                        dependentVersion: dependent.version,
                        updatePackage: updateName,
                        currentVersion: dependent.dependentOnVersion,
                        plannedVersion,
                    });

                    // Get the dependent package's version data to check its peer dependencies
                    const dependentVersionClean = getCleanVersion(dependent.version);
                    if (!dependentVersionClean) continue;

                    const dependentVersionData = await getPackageVersionData(dependent.name, dependentVersionClean);
                    if (!dependentVersionData?.dependencies) continue;

                    // Check if this dependent has a dependency on the package we're updating
                    const depVersion = dependentVersionData.dependencies[updateName];
                    if (!depVersion) continue;

                    // Clean the planned update version for comparison
                    // const plannedVersionClean = getCleanVersion(plannedVersion);
                    // if (!plannedVersionClean) continue;

                    // Check if the planned update version satisfies the dependent's dependency requirement
                    if (!satisfiesVersionRange(plannedVersion, depVersion)) {
                        const conflict = {
                            packageName: dependent.name,
                            currentVersion: dependent.version,
                            conflictsWithPackageName: updateName,
                            conflictsWithVersion: plannedVersion,
                            reason: `requires ${updateName}@${depVersion} but updating to ${plannedVersion}`,
                        };
                        conflicts.push(conflict);

                        logger.warn('Conflict detected', conflict);
                    }
                } catch (error) {
                    // Continue if we can't analyze this dependent package
                    const errorMsg = `Could not analyze dependent ${dependent.name} for conflicts: ${error instanceof Error ? error.message : String(error)}`;
                    resolutions.push(`⚠ Warning: ${errorMsg}`);
                    logger.error('Failed to analyze dependent package for conflicts', {
                        package: dependent.name,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } catch (error) {
            // Continue if we can't analyze this update
            const errorMsg = `Could not analyze ${updateName} for conflicts: ${error instanceof Error ? error.message : String(error)}`;
            resolutions.push(`⚠ Warning: ${errorMsg}`);
            logger.error('Failed to analyze package update for conflicts', {
                package: updateName,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    logger.info('Conflict analysis completed', {
        conflictCount: conflicts.length,
        resolutionCount: resolutions.length,
    });

    return { conflicts, resolutions };
}

/**
 * Attempts to resolve conflicts by finding compatible versions
 * @param packageJson Package.json to modify
 * @param conflicts Array of conflicts to resolve
 * @returns Array of resolution messages
 */
export async function resolveConflicts(packageJson: PackageJson, conflicts: ConflictInfo[]): Promise<string[]> {
    const logger = getLogger().child('ConflictResolution');
    logger.info('Starting conflict resolution', { conflictCount: conflicts.length });

    const resolutions: string[] = [];

    for (const conflict of conflicts) {
        logger.debug('Resolving conflict', conflict);
        resolutions.push(`🚨 CONFLICT: ${conflict.packageName}@${conflict.currentVersion} ${conflict.reason}`);

        // Try to find a compatible version of the conflicting package
        try {
            logger.debug('Fetching package versions for conflict resolution', {
                package: conflict.packageName,
            });

            const versions = await getPackageVersions(conflict.packageName);

            const updateName = conflict.conflictsWithPackageName;
            const updateVersion = conflict.conflictsWithVersion;
            const updateVersionClean = getCleanVersion(updateVersion);

            if (!updateVersionClean) {
                const errorMsg = `Could not parse update version: ${updateVersion}`;
                resolutions.push(`❌ ${errorMsg}`);
                logger.error(errorMsg, { version: updateVersion });
                continue;
            }

            logger.trace('Searching for compatible version', {
                package: conflict.packageName,
                updatePackage: updateName,
                updateVersion: updateVersionClean,
                availableVersions: versions.length,
            });

            let compatibleVersion = null;
            for (const version of versions.sort((a, b) => b.localeCompare(a))) {
                try {
                    const versionData = await getPackageVersionData(conflict.packageName, version);
                    const peerDep = versionData.peerDependencies?.[updateName];
                    if (peerDep && satisfiesVersionRange(updateVersionClean, peerDep)) {
                        compatibleVersion = version;
                        logger.debug('Found compatible version', {
                            package: conflict.packageName,
                            version: compatibleVersion,
                        });
                        break;
                    }
                } catch (versionError) {
                    // Skip this version if we can't fetch its data
                    logger.trace('Skipping version due to fetch error', {
                        package: conflict.packageName,
                        version,
                        error: versionError instanceof Error ? versionError.message : String(versionError),
                    });
                    continue;
                }
            }

            if (compatibleVersion) {
                resolutions.push(`💡 SOLUTION: Update ${conflict.packageName} to ${compatibleVersion} to support ${conflict.conflictsWithPackageName}@${conflict.conflictsWithVersion}`);

                // Auto-update the conflicting package
                const isDev = isDevDependency(packageJson, conflict.packageName);
                updateDependency(packageJson, conflict.packageName, `^${compatibleVersion}`, isDev);
                resolutions.push(`✓ Auto-updated ${conflict.packageName} to ^${compatibleVersion}`);

                logger.info('Successfully resolved conflict', {
                    package: conflict.packageName,
                    newVersion: compatibleVersion,
                    isDev,
                });
            } else {
                const noCompatibleMsg = `No compatible version of ${conflict.packageName} found for ${conflict.conflictsWithPackageName}@${conflict.conflictsWithVersion}`;
                resolutions.push(`❌ ${noCompatibleMsg}`);
                logger.warn(noCompatibleMsg);

                // Special handling for known ecosystem packages
                if (conflict.packageName.includes('storybook')) {
                    resolutions.push(`   💡 TIP: Consider updating to Storybook 7.x or 8.x which supports Angular 20`);
                    resolutions.push(`   💡 Run: npm install @storybook/angular@latest @storybook/core@latest`);
                    logger.info('Provided Storybook-specific resolution tip');
                } else if (conflict.packageName.includes('angular')) {
                    resolutions.push(`   💡 TIP: This Angular-related package may need a major version update`);
                    logger.info('Provided Angular-specific resolution tip');
                }

                resolutions.push(`   Alternative: Use --force or --legacy-peer-deps to override (may cause issues)`);
            }
        } catch (error) {
            const errorMsg = `Failed to analyze ${conflict.packageName}: ${error instanceof Error ? error.message : String(error)}`;
            resolutions.push(`❌ ${errorMsg}`);
            logger.error('Failed to resolve conflict', {
                package: conflict.packageName,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    logger.info('Conflict resolution completed', {
        totalResolutions: resolutions.length,
    });

    return resolutions;
}
