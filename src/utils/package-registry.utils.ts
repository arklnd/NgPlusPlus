import { spawn } from 'child_process';
import { getLogger } from './logger.utils.js';

export interface RegistryData {
    versions: Record<
        string,
        {
            dependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
        }
    >;
    'dist-tags'?: {
        latest?: string;
        [tag: string]: string | undefined;
    };
}

export interface PackageVersionData {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    version: string;
    name: string;
}

/**
 * Fetches package metadata using npm view command (respects .npmrc auth)
 * @param name Package name (can be scoped)
 * @returns Registry data with version information
 */
export async function getPackageData(name: string): Promise<RegistryData> {
    const logger = getLogger().child('PackageRegistry');

    logger.debug('Fetching package data via npm', { package: name });

    try {
        // Use npm view to get package info - this respects .npmrc authentication
        const data = await new Promise<RegistryData>((resolve, reject) => {
            const child = spawn('npm', ['view', name, '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    try {
                        const parsedData = JSON.parse(stdout);
                        resolve(parsedData);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse npm output: ${parseError}`));
                    }
                } else {
                    reject(new Error(`npm view failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to spawn npm process: ${error.message}`));
            });
        });

        logger.info('Successfully fetched package data via npm', {
            package: name,
            versionCount: Object.keys(data.versions || {}).length,
            latestVersion: data['dist-tags']?.latest,
        });

        return data;
    } catch (error) {
        logger.error('Failed to fetch package data via npm', {
            package: name,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Fetches specific version data for a package using npm view command
 * @param name Package name (can be scoped)
 * @param version Specific version to fetch
 * @returns Package version data with dependencies
 */
export async function getPackageVersionData(name: string, version: string): Promise<PackageVersionData> {
    const logger = getLogger().child('PackageRegistry');

    logger.debug('Fetching specific version data via npm', { package: name, version });

    try {
        // Use npm view to get specific version info - this respects .npmrc authentication
        const data = await new Promise<PackageVersionData>((resolve, reject) => {
            const child = spawn('npm', ['view', `${name}@${version}`, '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    try {
                        const parsedData = JSON.parse(stdout);
                        resolve(parsedData);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse npm output: ${parseError}`));
                    }
                } else {
                    reject(new Error(`npm view failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to spawn npm process: ${error.message}`));
            });
        });

        logger.info('Successfully fetched package version data via npm', {
            package: name,
            version,
            hasDependencies: !!data.dependencies,
            dependencyCount: Object.keys(data.dependencies || {}).length,
            hasPeerDependencies: !!data.peerDependencies,
            peerDependencyCount: Object.keys(data.peerDependencies || {}).length,
        });

        return data;
    } catch (error) {
        logger.error('Failed to fetch package version data via npm', {
            package: name,
            version,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Fetches available versions list for a package using npm view command
 * @param name Package name (can be scoped)
 * @returns Array of version strings
 */
export async function getPackageVersions(name: string): Promise<string[]> {
    const logger = getLogger().child('PackageRegistry');

    logger.debug('Fetching versions list via npm', { package: name });

    try {
        const versions = await new Promise<string[]>((resolve, reject) => {
            const child = spawn('npm', ['view', name, 'versions', '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    try {
                        const parsedData = JSON.parse(stdout);
                        resolve(Array.isArray(parsedData) ? parsedData : []);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse npm output: ${parseError}`));
                    }
                } else {
                    reject(new Error(`npm view failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to spawn npm process: ${error.message}`));
            });
        });

        logger.info('Successfully fetched package versions via npm', {
            package: name,
            versionCount: versions.length,
        });

        return versions;
    } catch (error) {
        logger.error('Failed to fetch package versions via npm', {
            package: name,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
/*
 * Utility functions for working with package registries
 * Alternate ideas: libnpmconfig, libnpmaccess, npm-registry-fetch
 */
