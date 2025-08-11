import { spawn } from 'child_process';
import { getLogger } from './logger.utils.js';

export interface RegistryData {
    versions: Record<string, { 
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
    }>;
    'dist-tags'?: {
        latest?: string;
        [tag: string]: string | undefined;
    };
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
                shell: true
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
            latestVersion: data['dist-tags']?.latest
        });
        
        return data;
    } catch (error) {
        logger.error('Failed to fetch package data via npm', { 
            package: name, 
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
/*
 * Utility functions for working with package registries
 * Alternate ideas: libnpmconfig, libnpmaccess, npm-registry-fetch
 */