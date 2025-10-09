// Enhanced dependency analysis interfaces
export interface DependencyConstraint {
    package: string;
    constraint: string;
    dependent: string;
    type: 'peer' | 'direct' | 'conflict' | 'version-mismatch';
    severity: 'blocking' | 'warning' | 'info';
}

export interface UpgradeStrategy {
    blockers: string[];
    targetVersions: Map<string, string>;
    rationale: string;
    confidence: number;
    phase: 'blocker-upgrade' | 'target-upgrade' | 'cleanup';
}

export interface ResolverAnalysis {
    constraints: DependencyConstraint[];
    blockers: string[];
    strategies: UpgradeStrategy[];
    recommendations: string[];
}

// Regex patterns for dependency analysis
const PEER_DEP_REGEX = /peer\s+((?:@[^\/\s]+\/)?[^@\s]+)@?((?:"[^"]*"|'[^']*'|[^\s]+)?)\s*from\s+((?:@[^\/\s]+\/)?[^@\s]+)(?:@([^\s]+))?/gi;
const CONFLICT_REGEX = /Found:\s+([^\s]+)@([^\s]+).*?Could not resolve dependency:.*?peer\s+([^\s]+)@([^\s]+)/gis;
const VERSION_MISMATCH_REGEX = /([^\s]+)@([^\s]+)\s+.*?requires\s+([^\s]+)\s*@([^\s,]+)/gi;
const UNMET_PEER_REGEX = /EBOX_UNMET_PEER_DEP\s+([^\s]+)@([^\s]+).*?requires\s+a\s+peer\s+of\s+([^\s]+)@([^\s]+)/gi;

/**
 * Analyzes dependency constraints from error output
 */
export function analyzeDependencyConstraints(errorOutput: string): DependencyConstraint[] {
    const constraints: DependencyConstraint[] = [];

    // Reset regex global state
    PEER_DEP_REGEX.lastIndex = 0;
    CONFLICT_REGEX.lastIndex = 0;
    VERSION_MISMATCH_REGEX.lastIndex = 0;
    UNMET_PEER_REGEX.lastIndex = 0;

    // Parse peer dependency errors
    let match;
    while ((match = PEER_DEP_REGEX.exec(errorOutput)) !== null) {
        const [, packageName, constraint, dependent, dependentVersion] = match;
        constraints.push({
            package: packageName,
            constraint: constraint || '*',
            dependent: dependentVersion ? `${dependent}@${dependentVersion}` : dependent,
            type: 'peer',
            severity: assessConstraintSeverity(constraint),
        });
    }

    // Parse version conflict errors
    CONFLICT_REGEX.lastIndex = 0;
    while ((match = CONFLICT_REGEX.exec(errorOutput)) !== null) {
        const [, foundPackage, foundVersion, requiredPackage, requiredVersion] = match;
        constraints.push({
            package: requiredPackage,
            constraint: requiredVersion,
            dependent: `${foundPackage}@${foundVersion}`,
            type: 'conflict',
            severity: 'blocking',
        });
    }

    // Parse version mismatch errors
    VERSION_MISMATCH_REGEX.lastIndex = 0;
    while ((match = VERSION_MISMATCH_REGEX.exec(errorOutput)) !== null) {
        const [, dependent, dependentVersion, requiredPackage, requiredVersion] = match;
        constraints.push({
            package: requiredPackage,
            constraint: requiredVersion,
            dependent: `${dependent}@${dependentVersion}`,
            type: 'version-mismatch',
            severity: assessConstraintSeverity(requiredVersion),
        });
    }

    // Parse unmet peer dependency errors
    UNMET_PEER_REGEX.lastIndex = 0;
    while ((match = UNMET_PEER_REGEX.exec(errorOutput)) !== null) {
        const [, dependent, dependentVersion, requiredPackage, requiredVersion] = match;
        constraints.push({
            package: requiredPackage,
            constraint: requiredVersion,
            dependent: `${dependent}@${dependentVersion}`,
            type: 'peer',
            severity: 'blocking',
        });
    }

    return deduplicateConstraints(constraints);
}

/**
 * Assesses the severity of a constraint
 */
export function assessConstraintSeverity(constraint: string): 'blocking' | 'warning' | 'info' {
    if (!constraint) return 'info';

    // Upper bound constraints (< or <=) are typically blocking for upgrades
    if (constraint.includes('<') && !constraint.includes('>=')) {
        return 'blocking';
    }

    // Exact version requirements can be blocking
    if (!constraint.includes('^') && !constraint.includes('~') && !constraint.includes('>=')) {
        return 'blocking';
    }

    return 'warning';
}

/**
 * Identifies blocking packages from constraints
 */
export function identifyBlockingPackages(constraints: DependencyConstraint[], targetPackages: string[]): string[] {
    const blockers = new Set<string>();

    constraints.forEach((constraint) => {
        if (constraint.severity === 'blocking') {
            // Extract package name from dependent (format: "package@version" or "@scope/package@version")
            let dependentPackage = constraint.dependent;
            const lastAtIndex = dependentPackage.lastIndexOf('@');
            if (lastAtIndex > 0) {
                dependentPackage = dependentPackage.substring(0, lastAtIndex);
            }

            // Check if this dependent is blocking any target packages
            if (targetPackages.some((target) => isRelatedPackage(dependentPackage, target) || constraint.package === target)) {
                blockers.add(dependentPackage);
            }
        }
    });

    return Array.from(blockers);
}

/**
 * Checks if two packages are related (from same ecosystem)
 */
export function isRelatedPackage(packageA: string, packageB: string): boolean {
    // Check if packages are from the same ecosystem
    const ecosystems = [
        ['@angular/', '@ngrx/', '@angular-devkit/', '@schematics/', 'ng-'],
        ['@storybook/', 'storybook'],
        ['@types/', 'typescript'],
        ['@babel/', 'babel-'],
        ['eslint', '@eslint/', 'eslint-'],
        ['webpack', 'webpack-', '@webpack/'],
    ];

    return ecosystems.some((ecosystem) => ecosystem.some((prefix) => packageA.startsWith(prefix)) && ecosystem.some((prefix) => packageB.startsWith(prefix)));
}

/**
 * Removes duplicate constraints
 */
function deduplicateConstraints(constraints: DependencyConstraint[]): DependencyConstraint[] {
    const seen = new Set<string>();
    return constraints.filter((constraint) => {
        const key = `${constraint.package}:${constraint.constraint}:${constraint.dependent}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
