// Known compatibility patterns for common packages
const KNOWN_COMPATIBILITY: Record<string, Record<string, string[]>> = {
    '@angular/core': {
        '20': ['@storybook/angular@^8.0.0', 'typescript@^5.6.0', '@angular/cli@^20.0.0'],
        '19': ['@storybook/angular@^8.0.0', 'typescript@^5.5.0', '@angular/cli@^19.0.0'],
        '18': ['@storybook/angular@^8.0.0', 'typescript@^5.4.0', '@angular/cli@^18.0.0'],
    },
    typescript: {
        '5.6': ['@angular/core@>=18.0.0', '@types/node@*'],
        '5.5': ['@angular/core@>=17.0.0', '@types/node@*'],
        '5.4': ['@angular/core@>=16.0.0', '@types/node@*'],
    },
};

export interface CompatibilityResult {
    compatible: boolean;
    conflicts: string[];
    recommendations: string[];
}

/**
 * Checks compatibility of a package version with other dependencies
 */
export function checkCompatibility(packageName: string, version: string, dependencies: Array<{ name: string; version: string }>): CompatibilityResult {
    const majorVersion = extractMajorVersion(version);
    const knownCompat = KNOWN_COMPATIBILITY[packageName]?.[majorVersion];

    if (!knownCompat) {
        return { compatible: true, conflicts: [], recommendations: [] };
    }

    const conflicts: string[] = [];
    const recommendations: string[] = [];

    dependencies.forEach((dep) => {
        const compatible = knownCompat.some((compat) => {
            const [compatPackage, compatVersion] = compat.split('@');
            return compatPackage === dep.name && isVersionCompatible(dep.version, compatVersion);
        });

        if (!compatible) {
            conflicts.push(`${dep.name}@${dep.version} is incompatible with ${packageName}@${version}`);
            const recommendedVersion = findRecommendedVersion(dep.name, knownCompat);
            if (recommendedVersion) {
                recommendations.push(`Upgrade ${dep.name} to ${recommendedVersion}`);
            }
        }
    });

    return {
        compatible: conflicts.length === 0,
        conflicts,
        recommendations,
    };
}

/**
 * Extracts major version from a version string
 */
export function extractMajorVersion(version: string): string {
    const match = version.match(/(\d+)/);
    return match ? match[1] : version;
}

/**
 * Checks if actual version is compatible with required version
 */
export function isVersionCompatible(actual: string, required: string): boolean {
    // Simple compatibility check - in real implementation, use semver
    const actualMajor = extractMajorVersion(actual);
    const requiredMajor = extractMajorVersion(required);

    if (required.startsWith('^')) {
        return parseInt(actualMajor) >= parseInt(requiredMajor);
    }
    if (required.startsWith('~')) {
        return actualMajor === requiredMajor;
    }
    if (required.includes('>=')) {
        return parseInt(actualMajor) >= parseInt(requiredMajor);
    }

    return actualMajor === requiredMajor;
}

/**
 * Finds recommended version for a package from compatibility list
 */
export function findRecommendedVersion(packageName: string, compatList: string[]): string | null {
    const recommendation = compatList.find((compat) => compat.startsWith(packageName + '@'));
    return recommendation ? recommendation.split('@')[1] : null;
}

/**
 * Gets known compatibility patterns for a package
 */
export function getKnownCompatibility(packageName: string): Record<string, string[]> | undefined {
    return KNOWN_COMPATIBILITY[packageName];
}
