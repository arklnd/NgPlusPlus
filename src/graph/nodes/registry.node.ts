import { ResolverState } from '@G/state';
import { hydrateConflictAnalysisWithRegistryData } from '@U/dumb-resolver-helper';
import { getLogger } from '@U/index';

/**
 * RegistryHydration Node - Fetches available versions from npm registry
 * for all packages involved in the conflict.
 * 
 * This is a NON-LLM node. It queries the npm registry to populate
 * each package's `packagesVersionData` array with versions newer than
 * the currently installed version. This data is critical for the
 * Strategist node to make informed version selection decisions.
 */
export async function registryNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:registry');
    const { conflictAnalysis } = state;

    if (!conflictAnalysis) {
        logger.warn('No conflict analysis available, skipping registry hydration');
        return {};
    }

    logger.info('Fetching available versions from npm registry', {
        packageCount: conflictAnalysis.allPackagesMentionedInError.length,
    });

    const hydratedAnalysis = await hydrateConflictAnalysisWithRegistryData(conflictAnalysis);

    logger.info('Registry hydration complete');

    return {
        conflictAnalysis: hydratedAnalysis,
    };
}
