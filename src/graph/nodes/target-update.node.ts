import { ResolverState } from '@G/state';
import { readPackageJson, writePackageJson, updateDependency } from '@U/package-json.utils';
import { getLogger } from '@U/index';
import { simpleGit } from 'simple-git';

/**
 * TargetUpdate Node - Updates package.json in the temp directory with the
 * user's desired dependency versions.
 * 
 * This node takes the user's target dependencies and writes them into
 * the package.json, then commits the change to git for audit trail.
 */
export async function targetUpdateNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:target-update');
    const { tempDir, updateDependencies } = state;

    logger.info('Updating package.json with target dependencies', {
        dependencyCount: updateDependencies.length,
    });

    const packageJson = await readPackageJson(tempDir);

    for (const dep of updateDependencies) {
        await updateDependency(packageJson, dep.name, dep.version, dep.isDev);
        logger.debug(`Set ${dep.name}@${dep.version} (isDev: ${dep.isDev})`);
    }

    await writePackageJson(tempDir, packageJson);

    // Commit the target dependency updates
    const git = simpleGit(tempDir);
    await git.add('.');
    await git.commit('Updated initial target dependencies in package.json');
    logger.info('Target dependencies committed to git');

    return {};
}
