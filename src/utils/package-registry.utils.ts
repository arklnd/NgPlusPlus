import axios from 'axios';
import registryUrl from 'registry-url';
import { getLogger } from './logger.utils.js';

export interface RegistryData {
    versions: Record<string, { 
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
    }>;
}

/**
 * Fetches package metadata from npm registry
 * @param name Package name (can be scoped)
 * @returns Registry data with version information
 */
export async function getPackageData(name: string): Promise<RegistryData> {
    const logger = getLogger().child('PackageRegistry');
    
    logger.debug('Fetching package data', { package: name });
    
    try {
        // Extract scope from package name if it's a scoped package
        const scope = name.startsWith('@') ? name.split('/')[0] : undefined;
        const registry = registryUrl(scope);
        
        // Normalize registry URL to ensure proper concatenation
        // Remove trailing slash if present, then add it back for consistency
        const normalizedRegistry = registry.endsWith('/') ? registry : `${registry}/`;
        const url = `${normalizedRegistry}${name}`;
        
        logger.trace('Making registry request', { 
            package: name, 
            scope, 
            registry: normalizedRegistry, 
            url 
        });
        
        const response = await axios.get(url);
        const data = response.data;
        
        logger.info('Successfully fetched package data', { 
            package: name, 
            versionCount: Object.keys(data.versions || {}).length,
            latestVersion: data['dist-tags']?.latest
        });
        
        return data;
    } catch (error) {
        logger.error('Failed to fetch package data', { 
            package: name, 
            error: error instanceof Error ? error.message : String(error),
            status: axios.isAxiosError(error) ? error.response?.status : undefined
        });
        throw error;
    }
}
