import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { ERESOLVErrorInfo, getLogger } from '@U/index';
import { PackageJson } from '@I/index';
import Arborist from '@npmcli/arborist';

/**
 * Reads and parses package.json from a given repository path
 * @param repoPath Path to the repository containing package.json
 * @returns Promise that resolves to parsed package.json object
 */
export async function readPackageJson(repoPath: string): Promise<PackageJson> {
    const logger = getLogger().child('PackageJson');
    const packageJsonPath = join(resolve(repoPath), 'package.json');

    logger.debug('Reading package.json', { path: packageJsonPath });

    if (!existsSync(packageJsonPath)) {
        logger.error('package.json not found', { path: packageJsonPath });
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    try {
        const content = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);

        logger.info('Successfully read package.json', {
            name: packageJson.name,
            version: packageJson.version,
            dependencies: Object.keys(packageJson.dependencies || {}).length,
            devDependencies: Object.keys(packageJson.devDependencies || {}).length,
        });

        return packageJson;
    } catch (error) {
        logger.error('Failed to parse package.json', {
            path: packageJsonPath,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Writes package.json back to the file system
 * @param repoPath Path to the repository containing package.json
 * @param packageJson The package.json object to write
 * @returns Promise that resolves when the write operation is complete
 */
export async function writePackageJson(repoPath: string, packageJson: PackageJson): Promise<void> {
    const logger = getLogger().child('PackageJson');
    const packageJsonPath = join(resolve(repoPath), 'package.json');

    logger.debug('Writing package.json', {
        path: packageJsonPath,
        name: packageJson.name,
        version: packageJson.version,
    });

    try {
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        logger.info('Successfully wrote package.json', { path: packageJsonPath });
    } catch (error) {
        logger.error('Failed to write package.json', {
            path: packageJsonPath,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Gets all dependencies (both regular and dev) from package.json
 * @param packageJson The package.json object
 * @returns Combined dependencies object
 */
export function getAllDependencies(packageJson: PackageJson): Record<string, string> {
    const logger = getLogger().child('PackageJson');
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    logger.trace('Retrieved all dependencies', {
        totalCount: Object.keys(allDeps).length,
        dependencies: Object.keys(packageJson.dependencies || {}).length,
        devDependencies: Object.keys(packageJson.devDependencies || {}).length,
    });

    return allDeps;
}

/**
 * Updates a dependency in the appropriate section (dependencies or devDependencies)
 * @param packageJson The package.json object to modify
 * @param name Package name
 * @param version New version
 * @param isDev Whether it's a dev dependency
 */
export async function updateDependency(packageJson: PackageJson, name: string, version: string, isDev: boolean): Promise<void> {
    const logger = getLogger().child('PackageJson');
    const target = isDev ? 'devDependencies' : 'dependencies';
    const oldVersion = isDev ? packageJson.devDependencies?.[name] : packageJson.dependencies?.[name];

    if (!packageJson[target]) packageJson[target] = {};
    packageJson[target]![name] = version;

    logger.info('Updated dependency', {
        package: name,
        oldVersion,
        newVersion: version,
        isDev,
        target,
    });
}

/**
 * Determines if a package is in devDependencies
 * @param packageJson The package.json object
 * @param packageName Name of the package to check
 * @returns True if the package is in devDependencies
 */
export function isDevDependency(packageJson: PackageJson, packageName: string): boolean {
    const logger = getLogger().child('PackageJson');
    const isDev = !!packageJson.devDependencies?.[packageName];

    logger.trace('Checked dependency type', {
        package: packageName,
        isDev,
    });

    return isDev;
}

/**
 * Gets all packages that depend on a given package
 */
export async function getAllDependent(repoPath: string, packageName: string): Promise<Record<string, PackageJson[]>> {
    const logger = getLogger().child('PackageJson');

    logger.debug('Getting dependents for package', { packageName, repoPath });

    try {
        // Execute npm ls command to get dependency tree with proper timeout handling
        const dependencyTree = await new Promise<any>((resolve, reject) => {
            let completed = false;

            const child = spawn('npm', ['ls', packageName, '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                cwd: repoPath,
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            // Set timeout that will reject after 60 minutes
            const timeoutId = setTimeout(() => {
                if (!completed) {
                    completed = true;
                    logger.warn('npm ls timeout', { packageName, repoPath });
                    child.kill(); // Kill the process
                    reject(new Error('npm ls timed out after 60 minutes'));
                }
            }, 3600000);

            child.on('close', (code: number | null) => {
                if (!completed) {
                    completed = true;
                    clearTimeout(timeoutId);

                    // npm ls can return non-zero exit code even for successful queries
                    // when there are warnings (like peer dependency issues)
                    try {
                        const parsedData = JSON.parse(stdout);
                        resolve(parsedData);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse npm ls output: ${parseError}`));
                    }
                }
            });

            child.on('error', (error: Error) => {
                if (!completed) {
                    completed = true;
                    clearTimeout(timeoutId);
                    reject(new Error(`Failed to spawn npm process: ${error.message}`));
                }
            });
        });

        // Parse the dependency tree to find dependents
        const result: Record<string, PackageJson[]> = {};

        function traverseDependencies(deps: any, parentName: string, parentVersion: string, path: string[] = []) {
            if (!deps || typeof deps !== 'object') return;

            // Avoid circular dependencies
            if (path.includes(parentName)) return;

            for (const [depName, depInfo] of Object.entries(deps)) {
                if (typeof depInfo !== 'object' || depInfo === null) continue;

                const depData = depInfo as any;
                const currentPath = [...path, parentName];

                // If this dependency is our target package
                if (depName === packageName && depData.version) {
                    const targetVersion = depData.version;

                    // Initialize array for this version if it doesn't exist
                    if (!result[targetVersion]) {
                        result[targetVersion] = [];
                    }

                    // Add the parent package as a dependent
                    const existingDependent = result[targetVersion].find((p) => p.name === parentName);
                    if (!existingDependent && currentPath.length > 1) {
                        result[targetVersion].push({
                            name: parentName,
                            version: parentVersion,
                            traversalPath: currentPath,
                        });
                    }
                }

                // Recursively check this dependency's dependencies
                if (depData.dependencies) {
                    traverseDependencies(depData.dependencies, depName, depData.version || 'unknown', currentPath);
                }
            }
        }

        // Start traversal from root dependencies
        if (dependencyTree.dependencies) {
            traverseDependencies(dependencyTree.dependencies, dependencyTree.name || 'root', dependencyTree.version || '0.0.0');
        }

        logger.info('Successfully found dependents', {
            packageName,
            versionsFound: Object.keys(result).length,
            totalDependents: Object.values(result).reduce((sum, arr) => sum + arr.length, 0),
        });

        return result;
    } catch (error) {
        logger.error('Failed to get dependents', {
            packageName,
            repoPath,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * do npm install in the given repo path using @npmcli/arborist
 * @param repoPath Path to the repository
 * @returns Promise with stdout, stderr, and success status (only resolves on success, rejects on failure)
 */
export async function installDependencies(repoPath: string): Promise<{ stdout: string; stderr: string; success: boolean }> {
    const logger = getLogger().child('PackageJson');
    logger.debug('Installing dependencies using Arborist', { repoPath });

    try {
        // Ensure Cypress and Puppeteer use global caches by inheriting environment variables
        // This prevents re-downloading Cypress binary and Chrome browser on every temp directory install
        const env = {
            ...process.env,
            // Explicitly set Cypress cache folder if not already set
            CYPRESS_CACHE_FOLDER: process.env.CYPRESS_CACHE_FOLDER || (process.platform === 'win32' ? `${process.env.LOCALAPPDATA}\\Cypress\\Cache` : `${process.env.HOME}/.cache/Cypress`),
            // Explicitly set Puppeteer cache folder for browser downloads
            PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || (process.platform === 'win32' ? `${process.env.USERPROFILE}\\.cache\\puppeteer` : `${process.env.HOME}/.cache/puppeteer`),
        };

        const arb = new Arborist({
            path: repoPath,
            env,
        });

        // Build the ideal tree from package.json
        await arb.buildIdealTree();

        logger.info('Successfully installed dependencies using Arborist', { repoPath });
        return { stdout: '', stderr: '', success: true };
    } catch (error) {
        const errorJson = JSON.stringify(error);
        const errorMessage = `Arborist install failed: ${error instanceof Error ? error.message : errorJson}`;
        logger.error(errorMessage, {
            repoPath,
            error: formatInstallError(errorJson),
        });
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ERESOLVE') {
            return { stdout: '', stderr: errorJson, success: false };
        }
        throw error;
    }
}


export function formatInstallError(installError: string): string {
    try {
        const errorObj = JSON.parse(installError) as ERESOLVErrorInfo;

        const lines: string[] = [];
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📦 DEPENDENCY CONFLICT DETECTED (ERESOLVE)');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');

        // Current (Installed) Package
        if (errorObj.current) {
            lines.push('📍 CURRENT VERSION (Installed):');
            lines.push(`   Package: ${errorObj.current.name}`);
            lines.push(`   Version: ${errorObj.current.version}`);
            lines.push(`   Required by: ${errorObj.currentEdge?.from?.location || 'Unknown'}`);
            lines.push(`   Spec: ${errorObj.currentEdge?.spec || 'N/A'}`);
            lines.push('');
        }

        // Conflicting Edge
        if (errorObj.edge) {
            lines.push('❌ CONFLICTING REQUIREMENT:');
            lines.push(`   Package: ${errorObj.edge.name}`);
            lines.push(`   Required Version: ${errorObj.edge.spec}`);
            lines.push(`   Dependency Type: ${errorObj.edge.type}`);
            lines.push(`   Required by: ${errorObj.edge.from?.name || 'Unknown'}`);
            if (errorObj.edge.from?.version) {
                lines.push(`   Provider Version: ${errorObj.edge.from.version}`);
            }
            lines.push('');
        }

        // Installation Context
        if (errorObj.current?.whileInstalling) {
            lines.push('📥 WHILE INSTALLING:');
            lines.push(`   Package: ${errorObj.current.whileInstalling.name}`);
            lines.push(`   Version: ${errorObj.current.whileInstalling.version}`);
            lines.push(`   Path: ${errorObj.current.whileInstalling.path}`);
            lines.push('');
        }

        // Resolution Suggestions
        lines.push('💡 RESOLUTION OPTIONS:');
        lines.push(`   1. Update ${errorObj.current?.name || 'current package'} to match the required spec: ${errorObj.edge?.spec || 'N/A'}`);
        lines.push(`   2. Downgrade ${errorObj.edge?.from?.name || 'conflicting package'} to a version that doesn't require ${errorObj.edge?.spec || 'N/A'}`);
        lines.push(`   3. Use --force flag to ignore peer dependency conflicts (not recommended)`);
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return lines.join('\n');
    } catch (parseError) {
        // Fallback for non-JSON error messages
        return installError.split('\n').filter(line => line.trim()).join('\n');
    }
}