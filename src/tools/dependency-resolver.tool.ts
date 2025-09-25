import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    readPackageJson,
    writePackageJson,
    updateDependency,
    analyzeConflicts,
    resolveConflicts,
    updateTransitiveDependencies,
    getLogger
} from '../utils/index.js';

/**
 * Main function to update package dependencies and resolve conflicts
 * @param repoPath Path to the repository containing package.json
 * @param plannedUpdates Array of dependency updates to apply
 * @returns String with all operation results
 */
export async function updatePackageWithDependencies(
    repoPath: string,
    plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>
): Promise<string> {
    const logger = getLogger().child('dependency-resolver');
    
    logger.info('Starting dependency update process', {
        repoPath,
        plannedUpdatesCount: plannedUpdates.length,
        plannedUpdates: plannedUpdates.map(u => `${u.name}@${u.version} (${u.isDev ? 'devDep' : 'dirDep'})`)
    });

    try {
        // Read package.json
        logger.debug('Reading package.json', { repoPath });
        const packageJson = readPackageJson(repoPath);
        logger.info('Successfully read package.json', {
            hasName: !!packageJson.name,
            hasVersion: !!packageJson.version,
            existingDepsCount: Object.keys(packageJson.dependencies || {}).length,
            existingDevDepsCount: Object.keys(packageJson.devDependencies || {}).length
        });
        
        const results: string[] = [];

        // Phase 1: Analyze conflicts
        // This phase examines the planned dependency updates against the current package.json
        // to identify potential version conflicts, incompatibilities, and dependency overlaps.
        // It performs a deep analysis of:
        // - Direct dependency conflicts (same package with different versions)
        // - Peer dependency requirements and compatibility
        // - Version range overlaps and semantic version conflicts
        // - Existing vs. planned dependency placement (dev vs prod dependencies)
        // The analysis returns both conflict data and preliminary resolution suggestions
        logger.info('Phase 1: Starting conflict analysis');
        const conflictAnalysisStart = Date.now();
        
        const { conflicts, resolutions: conflictAnalysisResults } = await analyzeConflicts(packageJson, plannedUpdates);
        
        const conflictAnalysisTime = Date.now() - conflictAnalysisStart;
        logger.info('Phase 1: Conflict analysis completed', {
            conflictsFound: conflicts.length,
            resolutionsGenerated: conflictAnalysisResults.length,
            analysisTimeMs: conflictAnalysisTime,
            conflicts: conflicts.map(c => ({ 
                package: c.packageName, 
                current: c.currentVersion, 
                conflictsWithPackageName: c.conflictsWithPackageName,
                conflictsWithVersion: c.conflictsWithVersion,
                reason: c.reason 
            }))
        });
        
        results.push(...conflictAnalysisResults);

        // Phase 2: Resolve conflicts
        // This phase actively resolves any conflicts identified in Phase 1.
        // It implements conflict resolution strategies such as:
        // - Choosing the highest compatible version when version ranges overlap
        // - Moving dependencies between dev/prod sections when appropriate
        // - Applying semantic versioning rules to determine best-fit versions
        // - Resolving peer dependency conflicts by adjusting dependent packages
        // - Providing fallback strategies when automatic resolution isn't possible
        // Only executes if conflicts were detected in the analysis phase
        if (conflicts.length > 0) {
            logger.info('Phase 2: Starting conflict resolution', { conflictCount: conflicts.length });
            const resolutionStart = Date.now();
            
            const resolutionResults = await resolveConflicts(packageJson, conflicts);
            
            const resolutionTime = Date.now() - resolutionStart;
            logger.info('Phase 2: Conflict resolution completed', {
                resolutionsApplied: resolutionResults.length,
                resolutionTimeMs: resolutionTime
            });
            
            results.push(...resolutionResults);
        } else {
            logger.info('Phase 2: Skipping conflict resolution - no conflicts detected');
        }

        // Phase 3: Apply initial updates
        // This phase applies the planned dependency updates directly to the package.json object.
        // For each planned update, it:
        // - Updates the package version in the appropriate section (dependencies or devDependencies)
        // - Maintains proper semantic versioning format
        // - Preserves existing package.json structure and formatting
        // - Handles both new package additions and existing package version updates
        // - Ensures proper categorization between production and development dependencies
        logger.info('Phase 3: Starting dependency updates');
        const updateStart = Date.now();
        
        for (const { name, version, isDev } of plannedUpdates) {
            logger.debug('Updating dependency', { name, version, isDev });
            
            updateDependency(packageJson, name, version, isDev);
            const updateMessage = `✓ Updated ${name} to ${version} (${isDev ? 'devDependencies' : 'dependencies'})`;
            results.push(updateMessage);
            
            logger.trace('Dependency updated successfully', { name, version, isDev });
        }
        
        const updateTime = Date.now() - updateStart;
        logger.info('Phase 3: Dependency updates completed', {
            updatesApplied: plannedUpdates.length,
            updateTimeMs: updateTime
        });

        // Phase 4: Update transitive dependencies
        // This phase handles the complex task of updating indirect dependencies (dependencies of dependencies).
        // It performs:
        // - Recursive dependency tree analysis to identify all transitive dependencies
        // - Version compatibility checks for nested dependency chains
        // - Automatic updates of transitive dependencies to maintain compatibility
        // - Resolution of diamond dependency problems (same package at different levels)
        // - Optimization of the dependency tree to minimize version conflicts
        // - Handling of optional dependencies and peer dependency requirements
        logger.info('Phase 4: Starting transitive dependency updates');
        const transitiveStart = Date.now();
        
        const transitiveResults = await updateTransitiveDependencies(packageJson, plannedUpdates);
        
        const transitiveTime = Date.now() - transitiveStart;
        logger.info('Phase 4: Transitive dependency updates completed', {
            transitiveUpdatesCount: transitiveResults.length,
            transitiveTimeMs: transitiveTime
        });
        
        results.push(...transitiveResults);

        // Phase 5: Write package.json
        // This final phase commits all changes back to the filesystem.
        // It:
        // - Serializes the modified package.json object back to JSON format
        // - Maintains proper JSON formatting and indentation
        // - Preserves file permissions and metadata
        // - Creates a backup of the original file (if configured)
        // - Validates the final package.json structure before writing
        // - Ensures atomic write operation to prevent corruption
        logger.info('Phase 5: Writing updated package.json');
        const writeStart = Date.now();
        
        writePackageJson(repoPath, packageJson);
        
        const writeTime = Date.now() - writeStart;
        logger.info('Phase 5: package.json written successfully', {
            writeTimeMs: writeTime,
            finalDepsCount: Object.keys(packageJson.dependencies || {}).length,
            finalDevDepsCount: Object.keys(packageJson.devDependencies || {}).length
        });
        
        results.push('✅ package.json updated successfully');
        
        const totalTime = Date.now() - conflictAnalysisStart;
        logger.info('Dependency update process completed successfully', {
            totalOperations: results.length,
            totalTimeMs: totalTime,
            phaseTimes: {
                conflictAnalysis: conflictAnalysisTime,
                conflictResolution: conflicts.length > 0 ? Date.now() - conflictAnalysisStart - conflictAnalysisTime : 0,
                dependencyUpdates: updateTime,
                transitiveUpdates: transitiveTime,
                fileWrite: writeTime
            }
        });
        
        return results.join('\n');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Dependency update process failed', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            repoPath,
            plannedUpdatesCount: plannedUpdates.length
        });
        
        throw new Error(`Failed to update dependencies: ${errorMessage}`);
    }
}

export function registerDependencyResolverTools(server: McpServer) {
    const logger = getLogger().child('dependency-resolver-tool');
    
    logger.info('Registering dependency resolver tools');
    
    server.registerTool(
        'dependency_resolver_update',
        {
            title: 'Dependency Resolver Update',
            description: 'Update package dependencies to specific versions and resolve their transitive dependencies automatically',
            inputSchema: {
                repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
                dependencies: z.array(z.object({
                    name: z.string().describe('Package name'),
                    version: z.string().describe('Target version'),
                    isDev: z.boolean().default(false).describe('Whether this is a dev dependency')
                })).describe('List of dependencies to update with their target versions')
            }
        },
        async ({ repo_path, dependencies }) => {
            const requestId = Math.random().toString(36).substring(2, 9);
            logger.info('Dependency resolver tool invoked', {
                requestId,
                repo_path,
                dependenciesCount: dependencies.length,
                dependencies: dependencies.map(d => `${d.name}@${d.version} (${d.isDev ? 'devDep' : 'dirDep'})`)
            });
            
            try {
                const startTime = Date.now();
                const result = await updatePackageWithDependencies(repo_path, dependencies);
                const executionTime = Date.now() - startTime;
                
                logger.info('Dependency resolver tool completed successfully', {
                    requestId,
                    executionTimeMs: executionTime,
                    resultLength: result.length
                });
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                logger.error('Dependency resolver tool failed', {
                    requestId,
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined,
                    repo_path,
                    dependenciesCount: dependencies.length
                });
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${errorMessage}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );
    
    logger.info('Dependency resolver tools registered successfully');
}
