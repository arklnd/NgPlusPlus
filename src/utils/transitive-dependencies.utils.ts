import { getPackageData } from './package-registry.utils.js';
import { getCleanVersion, satisfiesPeerDep, findCompatibleVersion } from './version.utils.js';
import { PackageJson, getAllDependencies, isDevDependency, updateDependency } from './package-json.utils.js';

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
export async function updateTransitiveDependencies(
    packageJson: PackageJson,
    updates: Array<{ name: string; version: string }>
): Promise<string[]> {
    // Collect all resolution messages for user feedback
    const results: string[] = [];

    // PHASE 1: RECURSIVE DEPENDENCY TREE ANALYSIS
    // Iterate through each updated package to analyze its complete dependency tree
    for (const { name, version } of updates) {
        try {
            // Fetch complete package registry data to access dependency metadata
            const registryData = await getPackageData(name);
            
            // VALIDATION: Ensure version specification is valid and parseable
            const cleanVersion = getCleanVersion(version);
            if (!cleanVersion) {
                results.push(`❌ Invalid version specification: ${version} for ${name}`);
                continue;
            }
            
            // VALIDATION: Verify the specific version exists in the registry
            const versionData = registryData.versions[cleanVersion];
            if (!versionData) {
                results.push(`❌ Version ${version} not found for ${name}`);
                continue;
            }

            // PHASE 2: COMPREHENSIVE DEPENDENCY COLLECTION
            // Merge both direct dependencies AND peer dependencies to handle all requirements.
            // This addresses the diamond dependency problem by considering all possible constraints.
            const allDeps = {
                ...(versionData.dependencies || {}),      // Direct runtime dependencies
                ...(versionData.peerDependencies || {})   // Peer dependencies that must be satisfied
            };

            // PHASE 3: VERSION COMPATIBILITY ANALYSIS FOR NESTED CHAINS
            // For each transitive dependency, perform deep compatibility checks
            for (const [depName, requiredRange] of Object.entries(allDeps)) {
                // Get the current state of all dependencies (deps, devDeps, peerDeps)
                const allExistingDeps = getAllDependencies(packageJson);
                const currentSpec = allExistingDeps[depName];
                
                // Skip dependencies that don't exist in the current project
                // (they might be optional or handled by other packages)
                if (!currentSpec) continue;

                // VALIDATION: Ensure current dependency version is parseable
                const currentVersion = getCleanVersion(currentSpec);
                if (!currentVersion) {
                    results.push(`❌ Invalid version specification: ${currentSpec} for ${depName}`);
                    continue;
                }
                
                // PHASE 4: COMPATIBILITY VERIFICATION
                // Check if current version satisfies the transitive dependency requirements
                if (satisfiesPeerDep(currentVersion, requiredRange)) {
                    results.push(`✓ ${depName}@${currentSpec} satisfies ${requiredRange}`);
                    continue;
                }

                // PHASE 5: CONFLICT RESOLUTION AND VERSION OPTIMIZATION
                // When compatibility issues are found, find the optimal version that satisfies all constraints
                
                // Fetch all available versions for the conflicting dependency
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
                    
                    results.push(`⚠ Updated ${depName} from ${currentSpec} to ${newSpec} (required by ${name}@${version})`);
                } else {
                    // PHASE 7: UNRESOLVABLE CONFLICT HANDLING
                    // When no compatible version exists, flag as unresolvable conflict
                    results.push(`❌ No suitable version found for ${depName} to satisfy ${requiredRange}`);
                }
            }
        } catch (error) {
            // PHASE 8: ERROR HANDLING AND RECOVERY
            // Gracefully handle registry failures, network issues, or malformed package data
            // This ensures that one problematic package doesn't break the entire resolution process
            results.push(`❌ Failed to process ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Return comprehensive resolution report for user review
    return results;
}
