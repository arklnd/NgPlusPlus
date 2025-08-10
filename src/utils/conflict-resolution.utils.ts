import { getPackageData, RegistryData } from './package-registry.utils.js';
import { getCleanVersion, satisfiesPeerDep, findCompatibleVersion } from './version.utils.js';
import { PackageJson, getAllDependencies, isDevDependency, updateDependency } from './package-json.utils.js';

export interface ConflictInfo {
    packageName: string;
    currentVersion: string;
    conflictsWith: string;
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
    const conflicts: ConflictInfo[] = [];
    const resolutions: string[] = [];
    
    for (const { name: updateName, version: plannedVersion } of plannedUpdates) {
        // Check all existing dependencies for peer dependency conflicts
        const allExistingDeps = getAllDependencies(packageJson);
        
        for (const [existingName, existingSpec] of Object.entries(allExistingDeps)) {
            if (existingName === updateName) continue; // Skip self
            
            try {
                // Get registry data for the existing package to check its peer dependencies
                const existingRegistry = await getPackageData(existingName);
                const existingVersion = getCleanVersion(existingSpec);
                if (!existingVersion) continue;
                
                // Get the specific version data for the existing package
                const existingVersionData = existingRegistry.versions[existingVersion];
                if (!existingVersionData?.peerDependencies) continue;
                
                // Check if this existing package has a peer dependency on the package we're updating
                const peerDep = existingVersionData.peerDependencies[updateName];
                if (!peerDep) continue;
                
                // Clean the planned update version for comparison
                const updateVersionClean = getCleanVersion(plannedVersion);
                if (!updateVersionClean) continue;
                
                // Check if the planned update version satisfies the existing package's peer dependency requirement
                if (!satisfiesPeerDep(updateVersionClean, peerDep)) {
                    conflicts.push({
                        packageName: existingName,
                        currentVersion: existingSpec as string,
                        conflictsWith: `${updateName}@${plannedVersion}`,
                        reason: `requires ${updateName}@${peerDep} but updating to ${plannedVersion}`
                    });
                }
            } catch (error) {
                // Continue if we can't analyze this package
                resolutions.push(`⚠ Warning: Could not analyze ${existingName} for conflicts: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    
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
    const resolutions: string[] = [];
    
    for (const conflict of conflicts) {
        resolutions.push(`🚨 CONFLICT: ${conflict.packageName}@${conflict.currentVersion} ${conflict.reason}`);
        
        // Try to find a compatible version of the conflicting package
        try {
            const conflictRegistry = await getPackageData(conflict.packageName);
            const versions = Object.keys(conflictRegistry.versions);
            
            const updateName = conflict.conflictsWith.split('@')[0];
            const updateVersion = conflict.conflictsWith.split('@')[1];
            const updateVersionClean = getCleanVersion(updateVersion);
            
            if (!updateVersionClean) {
                resolutions.push(`❌ Could not parse update version: ${updateVersion}`);
                continue;
            }
            
            let compatibleVersion = null;
            for (const version of versions.sort((a, b) => b.localeCompare(a))) {
                const versionData = conflictRegistry.versions[version];
                const peerDep = versionData.peerDependencies?.[updateName];
                if (peerDep && satisfiesPeerDep(updateVersionClean, peerDep)) {
                    compatibleVersion = version;
                    break;
                }
            }
            
            if (compatibleVersion) {
                resolutions.push(`💡 SOLUTION: Update ${conflict.packageName} to ${compatibleVersion} to support ${conflict.conflictsWith}`);
                
                // Auto-update the conflicting package
                const isDev = isDevDependency(packageJson, conflict.packageName);
                updateDependency(packageJson, conflict.packageName, `^${compatibleVersion}`, isDev);
                resolutions.push(`✓ Auto-updated ${conflict.packageName} to ^${compatibleVersion}`);
            } else {
                resolutions.push(`❌ No compatible version of ${conflict.packageName} found for ${conflict.conflictsWith}`);
                
                // Special handling for known ecosystem packages
                if (conflict.packageName.includes('storybook')) {
                    resolutions.push(`   💡 TIP: Consider updating to Storybook 7.x or 8.x which supports Angular 20`);
                    resolutions.push(`   💡 Run: npm install @storybook/angular@latest @storybook/core@latest`);
                } else if (conflict.packageName.includes('angular')) {
                    resolutions.push(`   💡 TIP: This Angular-related package may need a major version update`);
                }
                
                resolutions.push(`   Alternative: Use --force or --legacy-peer-deps to override (may cause issues)`);
            }
        } catch (error) {
            resolutions.push(`❌ Failed to analyze ${conflict.packageName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    return resolutions;
}
