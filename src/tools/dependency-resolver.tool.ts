import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import axios from 'axios';
import semver from 'semver';
import registryUrl from 'registry-url';

interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: any;
}

interface RegistryData {
    versions: Record<string, { 
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
    }>;
}

async function getPackageData(name: string): Promise<RegistryData> {
    // Extract scope from package name if it's a scoped package
    const scope = name.startsWith('@') ? name.split('/')[0] : undefined;
    const registry = registryUrl(scope);
    const response = await axios.get(`${registry}${name}`);
    return response.data;
}

async function updatePackageWithDependencies(
    repoPath: string,
    updates: Array<{ name: string; version: string; isDev: boolean }>
) {
    const packageJsonPath = join(resolve(repoPath), 'package.json');
    
    if (!existsSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const results: string[] = [];

    // Apply initial updates
    for (const { name, version, isDev } of updates) {
        const target = isDev ? 'devDependencies' : 'dependencies';
        if (!packageJson[target]) packageJson[target] = {};
        packageJson[target]![name] = version;
        results.push(`✓ Updated ${name} to ${version} (${target})`);
    }

    // Check and update transitive dependencies
    for (const { name, version } of updates) {
        try {
            const registryData = await getPackageData(name);
            // Use semver.coerce to extract clean version from any npm specification
            const coercedVersion = semver.coerce(version);
            if (!coercedVersion) {
                results.push(`❌ Invalid version specification: ${version} for ${name}`);
                continue;
            }
            const cleanVersion = coercedVersion.version;
            const versionData = registryData.versions[cleanVersion];
            
            if (!versionData) {
                results.push(`❌ Version ${version} not found for ${name}`);
                continue;
            }

            // Check both dependencies AND peerDependencies
            const allDeps = {
                ...(versionData.dependencies || {}),
                ...(versionData.peerDependencies || {})
            };

            for (const [depName, requiredRange] of Object.entries(allDeps)) {
                const currentSpec = packageJson.dependencies?.[depName] || packageJson.devDependencies?.[depName];
                if (!currentSpec) continue;

                // Use semver.coerce to extract clean version from any npm specification
                const coercedVersion = semver.coerce(currentSpec);
                if (!coercedVersion) {
                    results.push(`❌ Invalid version specification: ${currentSpec} for ${depName}`);
                    continue;
                }
                const currentVersion = coercedVersion.version;
                
                if (semver.satisfies(currentVersion, requiredRange)) {
                    results.push(`✓ ${depName}@${currentSpec} satisfies ${requiredRange}`);
                    continue;
                }

                // Find suitable version
                const depRegistry = await getPackageData(depName);
                const versions = Object.keys(depRegistry.versions).sort(semver.rcompare);
                const suitableVersion = versions.find(v => semver.satisfies(v, requiredRange));

                if (suitableVersion) {
                    const newSpec = `^${suitableVersion}`;
                    const target = packageJson.devDependencies?.[depName] ? 'devDependencies' : 'dependencies';
                    packageJson[target]![depName] = newSpec;
                    results.push(`⚠ Updated ${depName} from ${currentSpec} to ${newSpec} (required by ${name}@${version})`);
                } else {
                    results.push(`❌ No suitable version found for ${depName} to satisfy ${requiredRange}`);
                }
            }
        } catch (error) {
            results.push(`❌ Failed to process ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    results.push('✅ package.json updated successfully');
    
    return results.join('\n');
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
