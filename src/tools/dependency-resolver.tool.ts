import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import path from 'path';
import { readPackageJson, writePackageJson, updateDependency, analyzeConflicts, resolveConflicts, updateTransitiveDependencies, getLogger, validatePackageVersionsExist, ValidationResult } from '../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main function to update package dependencies and resolve conflicts
 * @param repoPath Path to the repository containing package.json
 * @param plannedUpdates Array of dependency updates to apply
 * @returns String with all operation results
 */
export async function updatePackageWithDependencies(repoPath: string, runNpmInstall: boolean, plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>): Promise<string> {
    const logger = getLogger().child(` ${__filename} `);

    logger.info('Starting dependency update process', {
        repoPath,
        plannedUpdatesCount: plannedUpdates.length,
        plannedUpdates: plannedUpdates.map((u) => `${u.name}@${u.version} (${u.isDev ? 'devDep' : 'dirDep'})`),
    });

    try {
        const results: string[] = [];

        // Phase 0: Validate package versions exist in npm registry
        // This phase verifies that all planned dependency updates reference actual versions
        // that exist in the npm registry before proceeding with any modifications.
        // It prevents the update process from failing later due to non-existent package versions.
        logger.info('Phase 0: Starting package version validation');
        const validationStart = Date.now();

        const validationResults = await validatePackageVersionsExist(plannedUpdates);
        const nonExistentVersions = validationResults.filter((result) => !result.exists);

        const validationTime = Date.now() - validationStart;
        logger.info('Phase 0: Package version validation completed', {
            totalPackages: validationResults.length,
            existingVersions: validationResults.length - nonExistentVersions.length,
            nonExistingVersions: nonExistentVersions.length,
            validationTimeMs: validationTime,
            nonExistentPackages: nonExistentVersions.map((v) => `${v.packageName}@${v.version}`),
        });

        // If any versions don't exist, throw an error with details
        if (nonExistentVersions.length > 0) {
            const errorDetails = nonExistentVersions.map((v) => `- ${v.packageName}@${v.version}: ${v.error || 'Version not found'}`).join('\n');

            const errorMessage = `The following package versions do not exist in the npm registry:\n${errorDetails}`;
            logger.error('Package validation failed - non-existent versions detected', {
                nonExistentCount: nonExistentVersions.length,
                nonExistentPackages: nonExistentVersions.map((v) => `${v.packageName}@${v.version}`),
            });

            throw new Error(errorMessage);
        }

        results.push(`✅ All ${plannedUpdates.length} package versions validated successfully`);

        // Read package.json
        logger.debug('Reading package.json', { repoPath });
        const packageJson = readPackageJson(repoPath);
        logger.info('Successfully read package.json', {
            hasName: !!packageJson.name,
            hasVersion: !!packageJson.version,
            existingDepsCount: Object.keys(packageJson.dependencies || {}).length,
            existingDevDepsCount: Object.keys(packageJson.devDependencies || {}).length,
        });

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

        const { conflicts, resolutions: conflictAnalysisResults } = await analyzeConflicts(repoPath, runNpmInstall, packageJson, plannedUpdates);

        const conflictAnalysisTime = Date.now() - conflictAnalysisStart;
        logger.info('Phase 1: Conflict analysis completed', {
            conflictsFound: conflicts.length,
            resolutionsGenerated: conflictAnalysisResults.length,
            analysisTimeMs: conflictAnalysisTime,
            conflicts: conflicts.map((c) => ({
                package: c.packageName,
                current: c.currentVersion,
                conflictsWithPackageName: c.conflictsWithPackageName,
                conflictsWithVersion: c.conflictsWithVersion,
                reason: c.reason,
            })),
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
                resolutionTimeMs: resolutionTime,
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
            updateTimeMs: updateTime,
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
            transitiveTimeMs: transitiveTime,
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
            finalDevDepsCount: Object.keys(packageJson.devDependencies || {}).length,
        });

        results.push('✅ package.json updated successfully');

        const totalTime = Date.now() - validationStart;
        logger.info('Dependency update process completed successfully', {
            totalOperations: results.length,
            totalTimeMs: totalTime,
            phaseTimes: {
                packageValidation: validationTime,
                conflictAnalysis: conflictAnalysisTime,
                conflictResolution: conflicts.length > 0 ? Date.now() - conflictAnalysisStart - conflictAnalysisTime : 0,
                dependencyUpdates: updateTime,
                transitiveUpdates: transitiveTime,
                fileWrite: writeTime,
            },
        });

        return results.join('\n');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Dependency update process failed', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            repoPath,
            plannedUpdatesCount: plannedUpdates.length,
        });

        throw new Error(`Failed to update dependencies: ${errorMessage}`);
    }
}

export function registerDependencyResolverTools(server: McpServer) {
    const logger = getLogger().child(`dependency-resolver-tool:${__dirname}`);

    logger.info('Registering dependency resolver tools');

    server.registerTool(
        'dependency_resolver_update',
        {
            title: 'Dependency Resolver Update',
            description: 'Update package dependencies to specific versions and resolve their transitive dependencies automatically',
            inputSchema: {
                repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
                run_npm_install: z.boolean().default(false).describe('Whether to run npm install during the process to fetch latest dependency info'),
                dependencies: z
                    .array(
                        z.object({
                            name: z.string().describe('Package name'),
                            version: z.string().describe('Target version'),
                            isDev: z.boolean().default(false).describe('Whether this is a dev dependency'),
                        })
                    )
                    .describe('List of dependencies to update with their target versions'),
            },
        },
        async ({ repo_path, run_npm_install, dependencies }) => {
            const requestId = Math.random().toString(36).substring(2, 9);
            logger.info('Dependency resolver tool invoked', {
                requestId,
                repo_path,
                dependenciesCount: dependencies.length,
                dependencies: dependencies.map((d) => `${d.name}@${d.version} (${d.isDev ? 'devDep' : 'dirDep'})`),
            });

            try {
                const startTime = Date.now();
                const result = await updatePackageWithDependencies(repo_path, run_npm_install, dependencies);
                const executionTime = Date.now() - startTime;

                logger.info('Dependency resolver tool completed successfully', {
                    requestId,
                    executionTimeMs: executionTime,
                    resultLength: result.length,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                logger.error('Dependency resolver tool failed', {
                    requestId,
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined,
                    repo_path,
                    dependenciesCount: dependencies.length,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    logger.info('Dependency resolver tools registered successfully');
}
