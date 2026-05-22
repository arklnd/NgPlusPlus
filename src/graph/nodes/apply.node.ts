import { ResolverState, DependencyUpdate } from '@G/state';
import { readPackageJson, writePackageJson, updateDependency, formatInstallError } from '@U/package-json.utils';
import { getLogger } from '@U/index';
import { simpleGit } from 'simple-git';

/**
 * Apply Node - Applies validated AI suggestions to package.json and commits to git.
 * 
 * This is a NON-LLM node. After the Validation node confirms suggestions are valid,
 * this node:
 * 1. Reads current package.json from temp dir
 * 2. Applies each suggestion (updating dependency versions)
 * 3. Writes the updated package.json
 * 4. Commits to git with detailed reasoning in the commit message
 * 5. Updates the updateDependencies list to track what's been changed
 */
export async function applyNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:apply');
    const { tempDir, validationResult, updateDependencies, attempt, aiRetryAttempt, installError, reasoningRecording } =
        state;

    if (!validationResult?.valid || !validationResult.suggestions.length) {
        logger.warn('No valid suggestions to apply');
        return {};
    }

    logger.info('Applying validated suggestions to package.json', {
        suggestionCount: validationResult.suggestions.length,
    });

    const packageJson = await readPackageJson(tempDir);
    const updatedDependencies: DependencyUpdate[] = [...updateDependencies];

    for (const suggestion of validationResult.suggestions) {
        await updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);

        // Update or add to the tracked dependencies list
        const existingDep = updatedDependencies.find((dep) => dep.name === suggestion.name);
        if (existingDep) {
            existingDep.version = suggestion.version;
            logger.info('Updated existing tracked dependency', {
                package: suggestion.name,
                version: suggestion.version,
            });
        } else {
            updatedDependencies.push({
                name: suggestion.name,
                version: suggestion.version,
                isDev: suggestion.isDev,
                reason: suggestion.reason,
                fromVersion: suggestion.fromVersion,
            });
            logger.info('Added new tracked dependency', {
                package: suggestion.name,
                version: suggestion.version,
            });
        }
    }

    await writePackageJson(tempDir, packageJson);

    // Commit to git with detailed reasoning
    const git = simpleGit(tempDir);
    await git.add('.');

    const suggestionSummary =
        '[Strategy] Suggestions:\n' +
        validationResult.suggestions
            .map((s) => `  - ${s.name}@${s.version}${s.reason ? ` (${s.reason})` : ''}`)
            .join('\n');

    // Add reasoning chain if available
    let reasoningDetails = '';
    const latestReasoning = reasoningRecording.updateMade.slice(-validationResult.suggestions.length);
    if (latestReasoning.length > 0) {
        reasoningDetails =
            '\n\n[Reasoning Chain]:\n' +
            latestReasoning
                .map(
                    (u) =>
                        `  - ${u.package.name} (rank: ${u.package.rank}): ${u.fromVersion} -> ${u.toVersion} | Due to: ${u.reason.name} (rank: ${u.reason.rank})`
                )
                .join('\n');
    }

    // Add install error context
    const errorContext = installError
        ? `\n\n[Error Context]:\n${formatInstallError(installError)}`
        : '';

    const commitMessage = `Applied AI strategic suggestions [attempt=${attempt}, aiRetry=${aiRetryAttempt}]\n\n${suggestionSummary}${reasoningDetails}${errorContext}`;

    await git.commit(commitMessage);

    const gitLog = await git.log({ maxCount: 3 });
    logger.info('Committed suggestions to git', {
        attempt,
        aiRetryAttempt,
        recentCommits: gitLog.all.map((c) => ({
            hash: c.hash.substring(0, 7),
            message: c.message,
        })),
    });

    return {
        updateDependencies: updatedDependencies,
        // Reset validation result for next cycle
        validationResult: null,
    };
}
