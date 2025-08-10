import axios from 'axios';
import registryUrl from 'registry-url';

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
    // Extract scope from package name if it's a scoped package
    const scope = name.startsWith('@') ? name.split('/')[0] : undefined;
    const registry = registryUrl(scope);
    
    // Normalize registry URL to ensure proper concatenation
    // Remove trailing slash if present, then add it back for consistency
    const normalizedRegistry = registry.endsWith('/') ? registry : `${registry}/`;
    
    const response = await axios.get(`${normalizedRegistry}${name}`);
    return response.data;
}
