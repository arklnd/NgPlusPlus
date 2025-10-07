import { DependencyConstraint, isRelatedPackage, UpgradeStrategy } from './dependency-analyzer.utils';

/**
 * Generates upgrade strategies based on constraints and blockers
 */
export async function generateUpgradeStrategies(constraints: DependencyConstraint[], blockers: string[], targetPackages: string[], currentPackageJson: any): Promise<UpgradeStrategy[]> {
    const strategies: UpgradeStrategy[] = [];

    // Strategy 1: Upgrade blockers first
    if (blockers.length > 0) {
        const blockerStrategy = await createBlockerUpgradeStrategy(blockers, constraints, targetPackages, currentPackageJson);
        if (blockerStrategy) strategies.push(blockerStrategy);
    }

    // Strategy 2: Find alternative target versions
    const alternativeStrategy = createAlternativeTargetStrategy(constraints, targetPackages, currentPackageJson);
    if (alternativeStrategy) strategies.push(alternativeStrategy);

    // Strategy 3: Ecosystem-wide upgrade
    const ecosystemStrategy = createEcosystemUpgradeStrategy(constraints, targetPackages, currentPackageJson);
    if (ecosystemStrategy) strategies.push(ecosystemStrategy);

    return strategies.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Creates a strategy for upgrading blocking packages
 */
async function createBlockerUpgradeStrategy(blockers: string[], constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): Promise<UpgradeStrategy | null> {
    const targetVersions = new Map<string, string>();
    const rationales: string[] = [];

    // Analyze each blocker and suggest upgrade versions
    for (const blocker of blockers) {
        const blockerConstraints = constraints.filter((c) => c.dependent.startsWith(blocker + '@'));

        // Find the minimum version needed to satisfy target upgrades
        const suggestedVersion = suggestBlockerUpgradeVersion(blocker, blockerConstraints, targetPackages);

        if (suggestedVersion) {
            targetVersions.set(blocker, suggestedVersion);
            rationales.push(`Upgrade ${blocker} to ${suggestedVersion} to support target packages`);
        }
    }

    if (targetVersions.size === 0) return null;

    return {
        blockers,
        targetVersions,
        rationale: rationales.join('; '),
        confidence: 0.8,
        phase: 'blocker-upgrade',
    };
}

/**
 * Creates a strategy for finding alternative target versions
 */
function createAlternativeTargetStrategy(constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): UpgradeStrategy | null {
    const targetVersions = new Map<string, string>();
    const rationales: string[] = [];

    // For each target package, find a version that satisfies constraints
    for (const target of targetPackages) {
        const relevantConstraints = constraints.filter((c) => c.package === target);
        const compatibleVersion = findCompatibleVersion(target, relevantConstraints);

        if (compatibleVersion && compatibleVersion !== 'latest') {
            targetVersions.set(target, compatibleVersion);
            rationales.push(`Use ${target}@${compatibleVersion} to satisfy dependency constraints`);
        }
    }

    if (targetVersions.size === 0) return null;

    return {
        blockers: [],
        targetVersions,
        rationale: rationales.join('; '),
        confidence: 0.6,
        phase: 'target-upgrade',
    };
}

/**
 * Creates a strategy for ecosystem-wide upgrades
 */
function createEcosystemUpgradeStrategy(constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): UpgradeStrategy | null {
    const targetVersions = new Map<string, string>();
    const ecosystemPackages = new Set<string>();

    // Identify ecosystem packages that need coordinated upgrades
    targetPackages.forEach((target) => {
        const relatedPackages = findEcosystemPackages(target, currentPackageJson);
        relatedPackages.forEach((pkg) => ecosystemPackages.add(pkg));
    });

    // Suggest coordinated versions for ecosystem packages
    ecosystemPackages.forEach((pkg) => {
        const suggestedVersion = suggestEcosystemVersion(pkg, targetPackages);
        if (suggestedVersion) {
            targetVersions.set(pkg, suggestedVersion);
        }
    });

    if (targetVersions.size <= 1) return null;

    return {
        blockers: [],
        targetVersions,
        rationale: `Coordinated ecosystem upgrade for ${Array.from(ecosystemPackages).join(', ')}`,
        confidence: 0.7,
        phase: 'cleanup',
    };
}

/**
 * Suggests upgrade version for blocking packages
 */
function suggestBlockerUpgradeVersion(blocker: string, constraints: DependencyConstraint[], targetPackages: string[]): string | null {
    // Common blocker upgrade patterns
    const upgradePatterns: Record<string, Record<string, string>> = {
        '@storybook/angular': {
            '@angular/core@20': '^8.0.0',
            '@angular/core@19': '^8.0.0',
            '@angular/core@18': '^8.0.0',
        },
        typescript: {
            '@angular/core@20': '^5.6.0',
            '@angular/core@19': '^5.5.0',
            '@angular/core@18': '^5.4.0',
        },
    };

    for (const target of targetPackages) {
        const pattern = upgradePatterns[blocker]?.[`${target}@*`];
        if (pattern) return pattern;
    }

    // Fallback: suggest latest major version
    return 'latest';
}

/**
 * Finds compatible version for a package given constraints
 */
function findCompatibleVersion(packageName: string, constraints: DependencyConstraint[]): string | null {
    // Analyze constraints to find compatible version range
    const upperBounds = constraints.filter((c) => c.constraint.includes('<')).map((c) => c.constraint);

    if (upperBounds.length > 0) {
        // Find the most restrictive upper bound and suggest a version just below it
        const mostRestrictive = upperBounds.sort()[0];
        const version = mostRestrictive.replace(/[<>=]/g, '').trim();
        const majorVersion = parseInt(version.split('.')[0]) - 1;
        return `^${majorVersion}.0.0`;
    }

    return null;
}

/**
 * Finds ecosystem packages related to a target package
 */
function findEcosystemPackages(target: string, packageJson: any): string[] {
    const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
    };

    return Object.keys(allDeps).filter((pkg) => isRelatedPackage(pkg, target));
}

/**
 * Suggests ecosystem version for a package
 */
function suggestEcosystemVersion(packageName: string, targetPackages: string[]): string | null {
    // Suggest compatible versions for ecosystem packages
    const ecosystemVersions: Record<string, string> = {
        '@angular/animations': '^20.0.0',
        '@angular/common': '^20.0.0',
        '@angular/compiler': '^20.0.0',
        '@angular/core': '^20.0.0',
        '@angular/forms': '^20.0.0',
        '@angular/platform-browser': '^20.0.0',
        '@angular/platform-browser-dynamic': '^20.0.0',
        '@angular/router': '^20.0.0',
        '@angular/cli': '^20.0.0',
        '@angular/compiler-cli': '^20.0.0',
    };

    return ecosystemVersions[packageName] || null;
}
