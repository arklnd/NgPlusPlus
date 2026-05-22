import { ResolverState } from '@G/state';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { simpleGit } from 'simple-git';
import { readPackageJson, installDependencies } from '@U/package-json.utils';
import { parseAndStoreDependencyMap, getLogger } from '@U/index';
import { validatePackageVersionsExist } from '@U/package-registry.utils';

const mkdtempAsync = promisify(mkdtemp);
const cpAsync = promisify(cp);

/**
 * Setup Node - Creates temp directory, copies package.json/lock, initializes git,
 * performs baseline npm install, and validates initial target versions.
 * 
 * This is the first node in the graph. It prepares the isolated working environment
 * where dependency resolution happens without touching the original project.
 */
export async function setupNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:setup');
    const { repoPath, updateDependencies } = state;

    logger.info('Starting setup phase', { repoPath, dependencyCount: updateDependencies.length });

    // Validate initial target dependency versions exist in registry
    logger.info('Validating initial target dependency versions exist in registry');
    const validationResults = await validatePackageVersionsExist({
        suggestions: updateDependencies,
        analysis: '',
        reasoning: { updateMade: [] },
    });
    const nonExistentVersions = validationResults.filter((r) => !r.exists);

    if (nonExistentVersions.length > 0) {
        const errorMessage = `Cannot proceed: Some target dependency versions do not exist in registry:\n${nonExistentVersions.map((r) => `- ${r.packageName}@${r.version}: ${r.error || 'Version not found'}`).join('\n')}`;
        logger.error('Target initial dependency validation failed', {
            nonExistentVersions: nonExistentVersions.map((r) => `${r.packageName}@${r.version}`),
        });
        return {
            finalStatus: 'failure',
            finalMessage: errorMessage,
        };
    }

    logger.info('All target dependency versions validated', {
        packages: validationResults.map((r) => `${r.packageName}@${r.version}`),
    });

    // Create temporary directory
    const tempDir = await mkdtempAsync(join(tmpdir(), 'ngpp-resolver-'));
    logger.debug('Created temporary directory', { tempDir });

    const originalPackageJsonPath = join(resolve(repoPath), 'package.json');
    const tempPackageJsonPath = join(tempDir, 'package.json');
    const tempPackageLockPath = join(tempDir, 'package-lock.json');
    const originalPackageLockPath = join(resolve(repoPath), 'package-lock.json');

    if (!existsSync(originalPackageJsonPath)) {
        return {
            finalStatus: 'failure',
            finalMessage: `package.json not found at ${originalPackageJsonPath}`,
        };
    }

    // Copy package.json to temp directory
    await cpAsync(originalPackageJsonPath, tempPackageJsonPath);
    logger.debug('Copied package.json to temp directory');

    // Copy package-lock.json if it exists
    if (existsSync(originalPackageLockPath)) {
        await cpAsync(originalPackageLockPath, tempPackageLockPath);
        await parseAndStoreDependencyMap(originalPackageLockPath, originalPackageJsonPath);
        logger.debug('Copied package-lock.json and parsed dependency map');
    }

    // Initialize git repository
    const git = simpleGit(tempDir);
    await git.init();
    const gitignorePath = join(tempDir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n*.log\n');
    logger.debug('Initialized git repository');

    // Ensure node_modules integrity with baseline install
    const { success: initialInstall } = await installDependencies(tempDir);
    if (!initialInstall) {
        return {
            tempDir,
            finalStatus: 'failure',
            finalMessage: 'Initial npm install in temp directory failed, cannot ensure node_modules integrity',
        };
    }

    // Commit initial state
    await git.add('.');
    await git.commit('Initial install to ensure integrity');
    logger.info('Setup phase complete - baseline install successful');

    return {
        tempDir,
        attempt: 0,
        aiRetryAttempt: 0,
        maxAiRetries: 5,
        installSuccess: false,
        installOutput: '',
        installError: '',
        conflictAnalysis: null,
        reasoningRecording: { updateMade: [] },
        validationResult: null,
        lastAiResponse: '',
        finalStatus: 'failure',
        finalMessage: '',
    };
}
