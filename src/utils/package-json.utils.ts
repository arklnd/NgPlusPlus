import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { getLogger } from './logger.utils.js';

export interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: any;
}

/**
 * Reads and parses package.json from a given repository path
 * @param repoPath Path to the repository containing package.json
 * @returns Parsed package.json object
 */
export function readPackageJson(repoPath: string): PackageJson {
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
 */
export function writePackageJson(repoPath: string, packageJson: PackageJson): void {
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
export function updateDependency(packageJson: PackageJson, name: string, version: string, isDev: boolean): void {
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
        // Execute npm ls command to get dependency tree
        const dependencyTree = await new Promise<any>((resolve, reject) => {
            const child = spawn('npm', ['ls', packageName, '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                cwd: repoPath,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            child.on('close', (code: number | null) => {
                // npm ls can return non-zero exit code even for successful queries
                // when there are warnings (like peer dependency issues)
                try {
                    const parsedData = JSON.parse(stdout);
                    resolve(parsedData);
                } catch (parseError) {
                    reject(new Error(`Failed to parse npm ls output: ${parseError}`));
                }
            });

            child.on('error', (error: Error) => {
                reject(new Error(`Failed to spawn npm process: ${error.message}`));
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
 * do npm install in the given repo path
 * @param repoPath Path to the repository
 */
export async function installDependencies(repoPath: string): Promise<void> {
    const logger = getLogger().child('PackageJson');

    logger.debug('Installing dependencies', { repoPath });

    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn('npm', ['install'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                cwd: repoPath,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    logger.info('Successfully installed dependencies', {
                        repoPath,
                        stdout: stdout.trim(),
                    });
                    resolve();
                } else {
                    const errorMessage = `npm install failed with exit code ${code}`;
                    logger.error(errorMessage, {
                        repoPath,
                        stderr: stderr.trim(),
                        stdout: stdout.trim(),
                    });
                    reject(new Error(`${errorMessage}: ${stderr || stdout}`));
                }
            });

            child.on('error', (error: Error) => {
                logger.error('Failed to spawn npm install process', {
                    repoPath,
                    error: error.message,
                });
                reject(new Error(`Failed to spawn npm install process: ${error.message}`));
            });
        });
    } catch (error) {
        logger.error('Failed to install dependencies', {
            repoPath,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
