import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

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
    const packageJsonPath = join(resolve(repoPath), 'package.json');
    
    if (!existsSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
}

/**
 * Writes package.json back to the file system
 * @param repoPath Path to the repository containing package.json
 * @param packageJson The package.json object to write
 */
export function writePackageJson(repoPath: string, packageJson: PackageJson): void {
    const packageJsonPath = join(resolve(repoPath), 'package.json');
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Gets all dependencies (both regular and dev) from package.json
 * @param packageJson The package.json object
 * @returns Combined dependencies object
 */
export function getAllDependencies(packageJson: PackageJson): Record<string, string> {
    return { ...packageJson.dependencies, ...packageJson.devDependencies };
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
    const target = isDev ? 'devDependencies' : 'dependencies';
    if (!packageJson[target]) packageJson[target] = {};
    packageJson[target]![name] = version;
}

/**
 * Determines if a package is in devDependencies
 * @param packageJson The package.json object
 * @param packageName Name of the package to check
 * @returns True if the package is in devDependencies
 */
export function isDevDependency(packageJson: PackageJson, packageName: string): boolean {
    return !!packageJson.devDependencies?.[packageName];
}
