import { ResolverState } from '@G/state';
import { installDependencies } from '@U/package-json.utils';
import { getLogger } from '@U/index';
import { simpleGit } from 'simple-git';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Install Node - Attempts npm install in the temp directory.
 * 
 * Removes package-lock.json before install to force fresh resolution.
 * On success, commits the result. On failure, captures the error for
 * downstream analysis by the ErrorParser node.
 */
export async function installNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:install');
    const { tempDir, attempt, maxAttempts } = state;
    const currentAttempt = attempt + 1;

    logger.info(`Installation attempt ${currentAttempt}/${maxAttempts}`);

    // Remove package-lock.json for fresh resolution
    const lockPath = join(tempDir, 'package-lock.json');
    if (existsSync(lockPath)) {
        rmSync(lockPath, { force: true });
        logger.debug('Removed package-lock.json for fresh resolution');
    }

    try {
        const { stdout, stderr, success } = await installDependencies(tempDir);

        if (success) {
            logger.info('Installation successful!', { attempt: currentAttempt });
            const git = simpleGit(tempDir);
            await git.add('.');
            await git.commit(`Successful installation after ${currentAttempt} attempts`);

            return {
                attempt: currentAttempt,
                installSuccess: true,
                installOutput: stdout,
                installError: '',
                // Reset AI retry counter for this cycle
                aiRetryAttempt: 0,
            };
        }

        // ERESOLVE returns success=false with stderr containing JSON error
        logger.warn('Installation failed with ERESOLVE', { attempt: currentAttempt });
        return {
            attempt: currentAttempt,
            installSuccess: false,
            installOutput: stdout,
            installError: stderr,
            aiRetryAttempt: 0,
        };
    } catch (error) {
        const installError = error instanceof Error ? error.message : String(error);
        logger.warn('Installation threw an error', { attempt: currentAttempt, error: installError });

        return {
            attempt: currentAttempt,
            installSuccess: false,
            installOutput: '',
            installError,
            aiRetryAttempt: 0,
        };
    }
}
