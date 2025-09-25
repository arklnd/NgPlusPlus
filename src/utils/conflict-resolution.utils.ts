import { getPackageData, RegistryData } from './package-registry.utils.js';
import { getCleanVersion, satisfiesPeerDep, findCompatibleVersion } from './version.utils.js';
import { PackageJson, getAllDependencies, isDevDependency, updateDependency } from './package-json.utils.js';
import { getLogger } from './logger.utils.js';

export interface ConflictInfo {
    packageName: string;
    currentVersion: string;
    conflictsWithPackageName: string;
    conflictsWithVersion: string;
    reason: string;
}

export interface ConflictResolution {
    conflicts: ConflictInfo[];
    resolutions: string[];
}

/**
 * Analyzes potential conflicts between existing dependencies and planned updates
 * @param packageJson Current package.json content
 * @param plannedUpdates Array of planned dependency updates
 * @returns Conflict analysis results
 */
export async function analyzeConflicts(
    packageJson: PackageJson,
    plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>
): Promise<ConflictResolution> {
    const logger = getLogger().child('ConflictResolution');
    logger.info('Starting conflict analysis', { plannedUpdateCount: plannedUpdates.length });
    
    const conflicts: ConflictInfo[] = [];
    const resolutions: string[] = [];
    
    for (const { name: updateName, version: plannedVersion } of plannedUpdates) {
        logger.debug('Analyzing conflicts for package update', { 
            package: updateName, 
            version: plannedVersion 
        });
        
        // Check all existing dependencies for peer dependency conflicts
        const allExistingDeps = getAllDependencies(packageJson);
        
        for (const [existingName, existingSpec] of Object.entries(allExistingDeps)) {
            if (existingName === updateName) continue; // Skip self
            
            try {
                logger.trace('Checking peer dependencies', { 
                    existingPackage: existingName, 
                    updatePackage: updateName 
                });
                
                // Get registry data for the existing package to check its peer dependencies
                const existingRegistry = await getPackageData(existingName);
                const existingVersion = getCleanVersion(existingSpec);
                if (!existingVersion) continue;
                
                // Get the specific version data for the existing package
                const existingVersionData = existingRegistry.versions[existingVersion];
                if (!existingVersionData?.peerDependencies) continue;
                
                // Check if this existing package has a peer dependency on the package we're updating
                const existingPeerDepVersion = existingVersionData.peerDependencies[updateName];
                if (!existingPeerDepVersion) continue;
                
                // Clean the planned update version for comparison
                const plannedVersionClean = getCleanVersion(plannedVersion);
                if (!plannedVersionClean) continue;
                
                // Check if the planned update version satisfies the existing package's peer dependency requirement
                if (!satisfiesPeerDep(plannedVersionClean, existingPeerDepVersion)) {
                    const conflict = {
                        packageName: existingName,
                        currentVersion: existingSpec as string,
                        conflictsWithPackageName: updateName,
                        conflictsWithVersion: plannedVersion,
                        reason: `requires ${updateName}@${existingPeerDepVersion} but updating to ${plannedVersion}`
                    };
                    conflicts.push(conflict);
                    
                    logger.warn('Conflict detected', conflict);
                }
            } catch (error) {
                // Continue if we can't analyze this package
                const errorMsg = `Could not analyze ${existingName} for conflicts: ${error instanceof Error ? error.message : String(error)}`;
                resolutions.push(`⚠ Warning: ${errorMsg}`);
                logger.error('Failed to analyze package for conflicts', { 
                    package: existingName, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        }
    }
    
    logger.info('Conflict analysis completed', { 
        conflictCount: conflicts.length, 
        resolutionCount: resolutions.length 
    });
    
    return { conflicts, resolutions };
}

/**
 * Attempts to resolve conflicts by finding compatible versions
 * @param packageJson Package.json to modify
 * @param conflicts Array of conflicts to resolve
 * @returns Array of resolution messages
 */
export async function resolveConflicts(
    packageJson: PackageJson,
    conflicts: ConflictInfo[]
): Promise<string[]> {
    const logger = getLogger().child('ConflictResolution');
    logger.info('Starting conflict resolution', { conflictCount: conflicts.length });
    
    const resolutions: string[] = [];
    
    for (const conflict of conflicts) {
        logger.debug('Resolving conflict', conflict);
        resolutions.push(`🚨 CONFLICT: ${conflict.packageName}@${conflict.currentVersion} ${conflict.reason}`);
        
        // Try to find a compatible version of the conflicting package
        try {
            logger.debug('Fetching package data for conflict resolution', { 
                package: conflict.packageName 
            });
            
            const conflictRegistry = await getPackageData(conflict.packageName);
            const versions = Object.keys(conflictRegistry.versions);
            
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
                availableVersions: versions.length 
            });
            
            let compatibleVersion = null;
            for (const version of versions.sort((a, b) => b.localeCompare(a))) {
                const versionData = conflictRegistry.versions[version];
                const peerDep = versionData.peerDependencies?.[updateName];
                if (peerDep && satisfiesPeerDep(updateVersionClean, peerDep)) {
                    compatibleVersion = version;
                    logger.debug('Found compatible version', { 
                        package: conflict.packageName, 
                        version: compatibleVersion 
                    });
                    break;
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
                    isDev 
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
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }
    
    logger.info('Conflict resolution completed', { 
        totalResolutions: resolutions.length 
    });
    
    return resolutions;
}
