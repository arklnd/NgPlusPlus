import { ResolverState } from '@G/state';
import { parseInstallErrorToConflictAnalysisStatically } from '@U/dumb-resolver-helper';
import { getLogger } from '@U/index';

/**
 * ErrorParser Node - Statically parses npm ERESOLVE errors into structured
 * ConflictAnalysis objects.
 * 
 * This is a NON-LLM node. It deterministically extracts:
 * - The conflicting package (name + current version)
 * - All dependents requiring conflicting versions
 * - Dependency types (peer vs regular)
 * - Whether each requirement is satisfied
 * 
 * All packages are initialized with rank: -1 for later enhancement
 * by the Ranking node.
 */
export async function errorParserNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:error-parser');
    const { installError } = state;

    logger.info('Parsing install error into conflict analysis');

    try {
        const conflictAnalysis = await parseInstallErrorToConflictAnalysisStatically(installError);

        logger.info('Conflict analysis generated', {
            conflictCount: conflictAnalysis.conflicts.length,
            packagesCount: conflictAnalysis.allPackagesMentionedInError.length,
            primaryConflict: conflictAnalysis.conflicts[0]?.packageName,
        });

        return {
            conflictAnalysis,
        };
    } catch (error) {
        logger.error('Failed to parse install error', {
            error: error instanceof Error ? error.message : String(error),
        });

        return {
            conflictAnalysis: {
                conflicts: [],
                allPackagesMentionedInError: [],
            },
        };
    }
}
