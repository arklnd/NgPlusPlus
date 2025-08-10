import * as semver from 'semver';

/**
 * Safely extracts a clean version from a version spec using semver
 * @param spec Version specification (e.g., "^1.2.3", "~2.0.0")
 * @returns Clean version string or null if invalid
 */
export function getCleanVersion(spec: string): string | null {
    const coerced = semver.coerce(spec);
    return coerced ? coerced.version : null;
}

/**
 * Checks if a version satisfies a peer dependency range
 * @param version The version to check
 * @param range The semver range to satisfy
 * @returns True if version satisfies the range
 */
export function satisfiesPeerDep(version: string, range: string): boolean {
    try {
        const cleanVersion = semver.coerce(version);
        if (!cleanVersion) return false;
        
        // Let semver handle all range types natively
        return semver.satisfies(cleanVersion.version, range);
    } catch (error) {
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
    const sortedVersions = availableVersions.sort(semver.rcompare);
    return semver.maxSatisfying(sortedVersions, requiredRange);
}
