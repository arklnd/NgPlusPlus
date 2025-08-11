import * as semver from 'semver';
import { getLogger } from './logger.utils.js';

/**
 * Safely extracts a clean version from a version spec using semver
 * @param spec Version specification (e.g., "^1.2.3", "~2.0.0")
 * @returns Clean version string or null if invalid
 */
export function getCleanVersion(spec: string): string | null {
    const logger = getLogger().child('Version');
    
    logger.trace('Parsing version specification', { spec });
    
    try {
        const coerced = semver.coerce(spec);
        const result = coerced ? coerced.version : null;
        
        if (result) {
            logger.trace('Successfully parsed version', { spec, result });
        } else {
            logger.warn('Failed to parse version specification', { spec });
        }
        
        return result;
    } catch (error) {
        logger.error('Error parsing version specification', { 
            spec, 
            error: error instanceof Error ? error.message : String(error) 
        });
        return null;
    }
}

/**
 * Checks if a version satisfies a peer dependency range
 * @param version The version to check
 * @param range The semver range to satisfy
 * @returns True if version satisfies the range
 */
export function satisfiesPeerDep(version: string, range: string): boolean {
    const logger = getLogger().child('Version');
    
    logger.trace('Checking peer dependency compatibility', { version, range });
    
    try {
        const cleanVersion = semver.coerce(version);
        if (!cleanVersion) {
            logger.warn('Could not coerce version for peer dependency check', { version, range });
            return false;
        }
        
        // Let semver handle all range types natively
        const satisfies = semver.satisfies(cleanVersion.version, range);
        
        logger.trace('Peer dependency check result', { 
            version, 
            range, 
            cleanVersion: cleanVersion.version, 
            satisfies 
        });
        
        return satisfies;
    } catch (error) {
        logger.error('Error checking peer dependency compatibility', { 
            version, 
            range, 
            error: error instanceof Error ? error.message : String(error) 
        });
        return false;
    }
}

/**
 * Finds the best compatible version from available versions that satisfies a range
 * @param availableVersions Array of available version strings
 * @param requiredRange Semver range requirement
 * @returns Best matching version or null if none found
 */
export function findCompatibleVersion(availableVersions: string[], requiredRange: string): string | null {
    const logger = getLogger().child('Version');
    
    logger.debug('Finding compatible version', { 
        availableCount: availableVersions.length, 
        requiredRange 
    });
    
    try {
        const sortedVersions = availableVersions.sort(semver.rcompare);
        const result = semver.maxSatisfying(sortedVersions, requiredRange);
        
        if (result) {
            logger.debug('Found compatible version', { 
                result, 
                requiredRange, 
                searchedVersions: availableVersions.length 
            });
        } else {
            logger.warn('No compatible version found', { 
                requiredRange, 
                availableVersions: availableVersions.slice(0, 5) // Log first 5 versions for debugging
            });
        }
        
        return result;
    } catch (error) {
        logger.error('Error finding compatible version', { 
            requiredRange, 
            availableCount: availableVersions.length,
            error: error instanceof Error ? error.message : String(error) 
        });
        return null;
    }
}
