import { spawn } from 'child_process';
import { getLogger } from '@U/index';
import { RegistryData, PackageVersionData, ValidationResult } from '@I/index';
import { NoSuitableVersionFoundError } from '@E/NoSuitableVersionFoundError';
import { getCachedPackageData, setCachedPackageData } from '@U/cache.utils';

/**
 * Fetches package metadata using npm view command (respects .npmrc auth)
 * @param name Package name (can be scoped)
 * @returns Registry data with version information
 */
export async function getPackageData(name: string, fields: string[] = []): Promise<RegistryData> {
    const logger = getLogger().child('PackageRegistry');

    logger.debug('Fetching package data via npm', { package: name });

    try {
        // Use npm view to get package info - this respects .npmrc authentication
        const data = await new Promise<RegistryData>((resolve, reject) => {
            const child = spawn('npm', ['view', name, ...fields, '--json'], {
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
                    if (fields.length === 1 && fields[0] === 'readme') {
                        // When only readme is requested, npm returns a string instead of an object
                        resolve({ readme: stdout.trim() } as RegistryData);
                        return;
                    }
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
            fields,
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
    const cacheKey = `ver-${name}@${version}`;

    logger.debug('Fetching specific version data via npm', { package: name, version });

    // Check cache first
    const cachedData = getCachedPackageData(cacheKey);
    if (cachedData) {
        logger.debug('Returning cached package version data', { package: name, version });
        return cachedData;
    }

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

        // Cache the result
        setCachedPackageData(cacheKey, data);

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

/**
 * Validates if planned package updates have existing versions in the npm registry
 * @param plannedUpdates Array of planned dependency updates
 * @returns Array of validation results indicating which packages/versions exist
 */
export async function validatePackageVersionsExist(plannedUpdates: Array<{ name: string; version: string; isDev: boolean }>): Promise<ValidationResult[]> {
    const logger = getLogger().child('PackageVersionValidator');

    logger.info('Starting package version validation', {
        packageCount: plannedUpdates.length,
        packages: plannedUpdates.map((u) => `${u.name}@${u.version}`),
    });

    const results: ValidationResult[] = [];

    // Process packages in parallel for better performance
    const validationPromises = plannedUpdates.map(async (update) => {
        const { name, version } = update;

        // if version is <NULL> throw error
        if (!version || version.trim() === '') {
            const errorMessage = `No Suitable Version Found for package: ${name}`;
            logger.error(errorMessage);
            throw new NoSuitableVersionFoundError(errorMessage);
        }

        logger.debug('Validating package version', { package: name, version });

        try {
            // Try to fetch the specific version data
            await getPackageVersionData(name, version);

            logger.trace('Package version exists', { package: name, version });

            return {
                packageName: name,
                version,
                exists: true,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.warn('Package version validation failed', {
                package: name,
                version,
                error: errorMessage,
            });

            return {
                packageName: name,
                version,
                exists: false,
                error: errorMessage,
            };
        }
    });

    try {
        const validationResults = await Promise.all(validationPromises);
        results.push(...validationResults);

        const existingCount = results.filter((r) => r.exists).length;
        const nonExistingCount = results.filter((r) => !r.exists).length;

        logger.info('Package version validation completed', {
            totalPackages: results.length,
            existingVersions: existingCount,
            nonExistingVersions: nonExistingCount,
            nonExistingPackages: results.filter((r) => !r.exists).map((r) => `${r.packageName}@${r.version}`),
        });

        return results;
    } catch (error) {
        logger.error('Package version validation failed', {
            error: error instanceof Error ? error.message : String(error),
            packageCount: plannedUpdates.length,
        });
        throw error;
    }
}

/*
 * Utility functions for working with package registries
 * Alternate ideas: libnpmconfig, libnpmaccess, npm-registry-fetch
 */
