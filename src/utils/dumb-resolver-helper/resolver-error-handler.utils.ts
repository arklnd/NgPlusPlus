import { ResolverAnalysis } from './dependency-analyzer.utils';

// Error pattern matching
const ERROR_PATTERNS = {
    PEER_DEPENDENCY: /peer.*dependency|EBOX_UNMET_PEER_DEP/i,
    VERSION_CONFLICT: /Could not resolve dependency|version conflict/i,
    PACKAGE_NOT_FOUND: /404.*not found|E404/i,
    NETWORK_ERROR: /network|timeout|ENOTFOUND/i,
    PERMISSION_ERROR: /EACCES|permission denied/i,
};

export interface ErrorAnalysis {
    category: string;
    severity: 'low' | 'medium' | 'high';
    actionable: boolean;
    suggestions: string[];
}

/**
 * Categorizes error output and provides actionable suggestions
 */
export function categorizeError(error: string): ErrorAnalysis {
    if (ERROR_PATTERNS.PEER_DEPENDENCY.test(error)) {
        return {
            category: 'peer-dependency',
            severity: 'high',
            actionable: true,
            suggestions: ['Analyze blocking packages and upgrade them', 'Check for newer versions that resolve peer conflicts', 'Consider using --force or --legacy-peer-deps as last resort'],
        };
    }

    if (ERROR_PATTERNS.VERSION_CONFLICT.test(error)) {
        return {
            category: 'version-conflict',
            severity: 'high',
            actionable: true,
            suggestions: ['Find compatible version ranges', 'Upgrade conflicting packages to compatible versions', 'Check for ecosystem-wide compatibility updates'],
        };
    }

    if (ERROR_PATTERNS.PACKAGE_NOT_FOUND.test(error)) {
        return {
            category: 'package-not-found',
            severity: 'high',
            actionable: true,
            suggestions: ['Verify package name spelling', 'Check if package has been renamed or deprecated', 'Try alternative package sources'],
        };
    }

    if (ERROR_PATTERNS.NETWORK_ERROR.test(error)) {
        return {
            category: 'network-error',
            severity: 'medium',
            actionable: false,
            suggestions: ['Check internet connection', 'Try different npm registry', 'Retry installation after delay'],
        };
    }

    return {
        category: 'unknown',
        severity: 'medium',
        actionable: false,
        suggestions: ['Review error output for specific issues'],
    };
}

/**
 * Logs strategic analysis information for debugging
 */
export function logStrategicAnalysis(logger: any, analysis: ResolverAnalysis, attempt: number): void {
    logger.info('Strategic Analysis Summary', {
        attempt,
        constraintsFound: analysis.constraints.length,
        blockingConstraints: analysis.constraints.filter((c) => c.severity === 'blocking').length,
        identifiedBlockers: analysis.blockers,
        strategiesGenerated: analysis.strategies.length,
        highConfidenceStrategies: analysis.strategies.filter((s) => s.confidence > 0.7).length,
    });

    if (analysis.constraints.length > 0) {
        logger.debug('Dependency Constraints', {
            constraints: analysis.constraints.map((c) => ({
                package: c.package,
                constraint: c.constraint,
                dependent: c.dependent,
                type: c.type,
                severity: c.severity,
            })),
        });
    }

    if (analysis.strategies.length > 0) {
        logger.debug('Generated Strategies', {
            strategies: analysis.strategies.map((s) => ({
                phase: s.phase,
                confidence: s.confidence,
                rationale: s.rationale,
                blockers: s.blockers,
                targetVersions: Object.fromEntries(s.targetVersions),
            })),
        });
    }
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: string): boolean {
    return ERROR_PATTERNS.NETWORK_ERROR.test(error) || ERROR_PATTERNS.PEER_DEPENDENCY.test(error) || ERROR_PATTERNS.VERSION_CONFLICT.test(error);
}

/**
 * Extracts package names from error messages
 */
export function extractPackagesFromError(error: string): string[] {
    const packages = new Set<string>();

    // Extract package names from peer dependency errors
    const peerDepMatches = error.matchAll(/peer\s+([^@\s]+)/gi);
    for (const match of peerDepMatches) {
        packages.add(match[1]);
    }

    // Extract package names from conflict errors
    const conflictMatches = error.matchAll(/Found:\s+([^@\s]+)@/gi);
    for (const match of conflictMatches) {
        packages.add(match[1]);
    }

    return Array.from(packages);
}

/**
 * Provides resolution hints based on error analysis
 */
export function getResolutionHints(errorAnalysis: ErrorAnalysis, packages: string[]): string[] {
    const hints: string[] = [];

    if (errorAnalysis.category === 'peer-dependency' && packages.length > 0) {
        hints.push(`Consider upgrading these packages: ${packages.join(', ')}`);
        hints.push('Look for compatible version ranges that satisfy all peer dependencies');
    }

    if (errorAnalysis.category === 'version-conflict') {
        hints.push('Try finding a common version range that satisfies all requirements');
        hints.push('Consider upgrading to newer major versions that may resolve conflicts');
    }

    return hints;
}
