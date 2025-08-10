import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    readPackageJson,
    writePackageJson,
    updateDependency,
    analyzeConflicts,
    resolveConflicts,
    updateTransitiveDependencies
} from '../utils/index.js';

/**
 * Main function to update package dependencies and resolve conflicts
 * @param repoPath Path to the repository containing package.json
 * @param plannedUpdates Array of dependency updates to apply
 * @returns String with all operation results
 */
async function updatePackageWithDependencies(
    repoPath: string,
    plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>
): Promise<string> {
    try {
        // Read package.json
        const packageJson = readPackageJson(repoPath);
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
        const { conflicts, resolutions: conflictAnalysisResults } = await analyzeConflicts(packageJson, plannedUpdates);
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
            const resolutionResults = await resolveConflicts(packageJson, conflicts);
            results.push(...resolutionResults);
        }

        // Phase 3: Apply initial updates
        // This phase applies the planned dependency updates directly to the package.json object.
        // For each planned update, it:
        // - Updates the package version in the appropriate section (dependencies or devDependencies)
        // - Maintains proper semantic versioning format
        // - Preserves existing package.json structure and formatting
        // - Handles both new package additions and existing package version updates
        // - Ensures proper categorization between production and development dependencies
        for (const { name, version, isDev } of plannedUpdates) {
            updateDependency(packageJson, name, version, isDev);
            results.push(`✓ Updated ${name} to ${version} (${isDev ? 'devDependencies' : 'dependencies'})`);
        }

        // Phase 4: Update transitive dependencies
        // This phase handles the complex task of updating indirect dependencies (dependencies of dependencies).
        // It performs:
        // - Recursive dependency tree analysis to identify all transitive dependencies
        // - Version compatibility checks for nested dependency chains
        // - Automatic updates of transitive dependencies to maintain compatibility
        // - Resolution of diamond dependency problems (same package at different levels)
        // - Optimization of the dependency tree to minimize version conflicts
        // - Handling of optional dependencies and peer dependency requirements
        const transitiveResults = await updateTransitiveDependencies(packageJson, plannedUpdates);
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
        writePackageJson(repoPath, packageJson);
        results.push('✅ package.json updated successfully');
        
        return results.join('\n');
    } catch (error) {
        throw new Error(`Failed to update dependencies: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function registerDependencyResolverTools(server: McpServer) {
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
            try {
                const result = await updatePackageWithDependencies(repo_path, dependencies);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}
