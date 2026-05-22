import { ResolverState } from '@G/state';
import { getLogger } from '@U/index';
import { existsSync, rmSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { cp } from 'fs';

const cpAsync = promisify(cp);

/**
 * Cleanup Node - Copies resolved files back to the original project and
 * cleans up the temporary directory.
 * 
 * This is always the final node. Regardless of success or failure, it:
 * 1. Copies package.json back to the original project
 * 2. Copies package-lock.json back (if it exists)
 * 3. Copies .git directory back (for audit trail)
 * 4. Removes the temporary directory
 * 5. Generates the final status message
 */
export async function cleanupNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:cleanup');
    const { tempDir, repoPath, installSuccess, attempt, maxAttempts, updateDependencies, reasoningRecording, installOutput, installError } =
        state;
    const copyBackErrors: string[] = [];

    if (!tempDir) {
        return {
            finalStatus: 'failure',
            finalMessage: 'No temporary directory to clean up',
        };
    }

    const originalPackageJsonPath = join(resolve(repoPath), 'package.json');
    const tempPackageJsonPath = join(tempDir, 'package.json');
    const tempPackageLockPath = join(tempDir, 'package-lock.json');
    const originalPackageLockPath = join(resolve(repoPath), 'package-lock.json');
    const tempGitPath = join(tempDir, '.git');
    const originalGitPath = join(resolve(repoPath), '.git');

    logger.info('Starting cleanup and copy-back', { installSuccess, tempDir, attempt });

    // Copy package.json back
    if (existsSync(tempPackageJsonPath)) {
        try {
            await cpAsync(tempPackageJsonPath, originalPackageJsonPath);
            logger.info('Copied package.json back to original location');
        } catch (e) {
            const error = `Failed to copy package.json: ${e instanceof Error ? e.message : String(e)}`;
            copyBackErrors.push(error);
            logger.error(error);
        }
    }

    // Copy package-lock.json back
    if (existsSync(tempPackageLockPath)) {
        try {
            await cpAsync(tempPackageLockPath, originalPackageLockPath);
            logger.info('Copied package-lock.json back to original location');
        } catch (e) {
            const error = `Failed to copy package-lock.json: ${e instanceof Error ? e.message : String(e)}`;
            copyBackErrors.push(error);
            logger.error(error);
        }
    }

    // Copy .git directory back for audit trail
    if (existsSync(tempGitPath)) {
        try {
            if (existsSync(originalGitPath)) {
                rmSync(originalGitPath, { recursive: true, force: true });
            }
            cpSync(tempGitPath, originalGitPath, { recursive: true });
            logger.info('Copied .git directory back for audit trail');
        } catch (e) {
            const error = `Failed to copy .git directory: ${e instanceof Error ? e.message : String(e)}`;
            copyBackErrors.push(error);
            logger.error(error);
        }
    }

    // Cleanup temp directory
    try {
        rmSync(tempDir, { recursive: true, force: true });
        logger.debug('Cleaned up temporary directory');
    } catch (e) {
        logger.warn('Failed to cleanup temp directory', {
            error: e instanceof Error ? e.message : String(e),
        });
    }

    // Generate final status message
    const copyBackSuccessful = copyBackErrors.length === 0;

    if (installSuccess && copyBackSuccessful) {
        // Log final reasoning chain
        logger.info('Final reasoning chain', {
            totalUpgrades: reasoningRecording.updateMade.length,
            upgrades: reasoningRecording.updateMade.map((u) => ({
                package: `${u.package.name} (rank: ${u.package.rank})`,
                versionChange: `${u.fromVersion} -> ${u.toVersion}`,
                dueToConflictWith: `${u.reason.name} (rank: ${u.reason.rank})`,
            })),
        });

        return {
            finalStatus: 'success',
            finalMessage:
                `Successfully updated dependencies after ${attempt} attempt(s):\n\n` +
                `Updated packages:\n${updateDependencies.map((dep) => `  - ${dep.name}@${dep.version}`).join('\n')}\n\n` +
                (reasoningRecording.updateMade.length > 0
                    ? `Reasoning chain:\n${reasoningRecording.updateMade.map((u) => `  - ${u.package.name}: ${u.fromVersion} -> ${u.toVersion} (due to ${u.reason.name})`).join('\n')}\n\n`
                    : '') +
                `Installation output:\n${installOutput.slice(-500)}`,
            copyBackErrors: [],
        };
    } else if (installSuccess && !copyBackSuccessful) {
        return {
            finalStatus: 'partial',
            finalMessage:
                `Dependencies resolved after ${attempt} attempt(s), but copy-back had issues:\n\n` +
                `Updated packages:\n${updateDependencies.map((dep) => `  - ${dep.name}@${dep.version}`).join('\n')}\n\n` +
                `Copy-back errors:\n${copyBackErrors.join('\n')}\n\n` +
                `Please check your files and ensure they are properly updated.`,
            copyBackErrors,
        };
    } else {
        const status = attempt >= maxAttempts ? `after ${maxAttempts} attempts` : `(interrupted after ${attempt} attempt(s))`;
        let errorMessage = `Failed to resolve dependencies ${status}.\n\n`;

        if (installError) {
            errorMessage += `Last error:\n${installError}\n\n`;
        }

        if (copyBackErrors.length > 0) {
            errorMessage += `Copy-back errors:\n${copyBackErrors.join('\n')}\n\n`;
        }

        errorMessage += `Please check the dependency versions and try again with compatible versions.`;

        return {
            finalStatus: 'failure',
            finalMessage: errorMessage,
            copyBackErrors,
        };
    }
}
