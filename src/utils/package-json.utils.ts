import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
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
            devDependencies: Object.keys(packageJson.devDependencies || {}).length
        });
        
        return packageJson;
    } catch (error) {
        logger.error('Failed to parse package.json', { 
            path: packageJsonPath, 
            error: error instanceof Error ? error.message : String(error) 
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
        version: packageJson.version 
    });
    
    try {
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        logger.info('Successfully wrote package.json', { path: packageJsonPath });
    } catch (error) {
        logger.error('Failed to write package.json', { 
            path: packageJsonPath, 
            error: error instanceof Error ? error.message : String(error) 
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
        devDependencies: Object.keys(packageJson.devDependencies || {}).length
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
export function updateDependency(
    packageJson: PackageJson, 
    name: string, 
    version: string, 
    isDev: boolean
): void {
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
        target 
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
        isDev 
    });
    
    return isDev;
}
