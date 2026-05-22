import { ResolverState } from '@G/state';
import { hydrateConflictAnalysisWithRanking } from '@U/dumb-resolver-helper';
import { getLogger } from '@U/index';

/**
 * Ranking Node - Uses LLM to rank packages by their importance/stability priority.
 * 
 * This is an LLM-powered node. For each package mentioned in the conflict analysis,
 * it calls the LLM to determine a ranking score (50-1200) based on:
 * - Package tier (CORE_FRAMEWORK, OFFICIAL_LIBRARIES, etc.)
 * - Ecosystem coherence
 * - Dependency impact (how many packages depend on it)
 * - Maintenance status
 * 
 * Rankings determine which packages get upgraded first (lower rank = upgrade first)
 * and which remain stable (higher rank = keep stable).
 */
export async function rankingNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:ranking');
    const { conflictAnalysis } = state;

    if (!conflictAnalysis) {
        logger.warn('No conflict analysis available, skipping ranking');
        return {};
    }

    logger.info('Ranking packages by importance', {
        packageCount: conflictAnalysis.allPackagesMentionedInError.length,
    });

    const rankedAnalysis = await hydrateConflictAnalysisWithRanking(conflictAnalysis);

    logger.info('Package ranking complete', {
        rankedPackages: rankedAnalysis.allPackagesMentionedInError.map((p) => ({
            name: p.name,
            rank: p.rank,
            tier: p.tier,
        })),
    });

    return {
        conflictAnalysis: rankedAnalysis,
    };
}
