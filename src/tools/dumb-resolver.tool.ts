import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { readPackageJson, writePackageJson, updateDependency, installDependencies } from '@U/package-json.utils';
import { validatePackageVersionsExist } from '@U/package-registry.utils';
import { getOpenAIService } from '@S/openai.service';
import { getLogger } from '@U/index';
import OpenAI from 'openai';
import { analyzeDependencyConstraints, identifyBlockingPackages, ResolverAnalysis, generateUpgradeStrategies, createEnhancedSystemPrompt, createStrategicPrompt, categorizeError, logStrategicAnalysis, checkCompatibility, hydrateConflictAnalysisWithRegistryData, parseInstallErrorToConflictAnalysis, hydrateConflictAnalysisWithRanking } from '@U/dumb-resolver-helper';
import { AIResponseFormatError, NoSuitableVersionFoundError, PackageVersionValidationError } from '@E/index';
import { ConflictAnalysis, ReasoningRecording, updateMade } from '@I/index';
import { generateStaticSuggestions } from '@/utils/dumb-resolver-helper/static-suggestion.utils';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

// Schema definitions
export const dependencyUpdateSchema = z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Target version'),
    isDev: z.boolean().default(false).describe('Whether this is a dev dependency'),
});

export const dumbResolverInputSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
    update_dependencies: z.array(dependencyUpdateSchema).describe('List of dependencies to update with their target versions'),
});

export type DumbResolverInput = z.infer<typeof dumbResolverInputSchema>;

const mkdtempAsync = promisify(mkdtemp);
const cpAsync = promisify(cp);

export const dumbResolverHandler = async (input: DumbResolverInput) => {
    const { repo_path, update_dependencies } = input;
    const logger = getLogger().child('dumb-resolver');
    const maxAttempts = 200;
    let attempt = 0;
    let tempDir: string | null = null;

    try {
        logger.info('Starting dependency resolution', {
            repoPath: repo_path,
            dependencies: update_dependencies,
        });

        // Validate initial target dependency versions exist in registry before proceeding
        logger.info('Validating initial target dependency versions exist in registry');
        const validationResults = await validatePackageVersionsExist(update_dependencies);
        const nonExistentVersions = validationResults.filter((r) => !r.exists);

        if (nonExistentVersions.length > 0) {
            const errorMessage = `Cannot proceed: Some target dependency versions do not exist in registry:\n${nonExistentVersions.map((r) => `- ${r.packageName}@${r.version}: ${r.error || 'Version not found'}`).join('\n')}`;
            logger.error('Target initial dependency validation failed', {
                nonExistentVersions: nonExistentVersions.map((r) => `${r.packageName}@${r.version}`),
                errors: nonExistentVersions.map((r) => r.error).filter(Boolean),
            });
            throw new Error(errorMessage);
        }

        logger.info('All target dependency versions exist in registry', {
            validatedPackages: validationResults.map((r) => `${r.packageName}@${r.version}`),
        });

        // #region Step 1: Create temporary directory and copy package.json
        tempDir = await mkdtempAsync(join(tmpdir(), 'dumb-resolver-'));
        logger.debug('Created temporary directory', { tempDir });

        const originalPackageJsonPath = join(resolve(repo_path), 'package.json');
        const tempPackageJsonPath = join(tempDir, 'package.json');
        const tempPackageLockPath = join(tempDir, 'package-lock.json');
        const originalPackageLockPath = join(resolve(repo_path), 'package-lock.json');

        if (!existsSync(originalPackageJsonPath)) {
            throw new Error(`package.json not found at ${originalPackageJsonPath}`);
        }

        // Copy package.json to temp directory
        await cpAsync(originalPackageJsonPath, tempPackageJsonPath);
        logger.debug('Copied package.json to temp directory');

        // Copy package-lock.json if it exists
        if (existsSync(originalPackageLockPath)) {
            await cpAsync(originalPackageLockPath, tempPackageLockPath);
            logger.debug('Copied package-lock.json to temp directory');
        }
        // #endregion

        // #region Step 1.5: ensure node_modules integrity in tempDir
        const { success: initialInstall } = await installDependencies(tempDir);
        if (!initialInstall) {
            throw new Error('initial npm install in temp directory failed, cannot ensure node_modules integrity');
        }
        // endregion

        // #region Step 2: Read and update package.json with target dependencies
        let packageJson = readPackageJson(tempDir);
        const originalPackageJson = JSON.stringify(packageJson); // Deep clone for AI context

        for (const dep of update_dependencies) {
            updateDependency(packageJson, dep.name, dep.version, dep.isDev);
        }

        writePackageJson(tempDir, packageJson);
        logger.info('Updated dependencies in temp package.json');
        // #endregion

        // #region Step 3: Attempt installation with retry logic
        const openai = getOpenAIService({ model: 'copilot-gpt-4', baseURL: 'http://localhost:3000/v1/', maxTokens: 10000, timeout: 300000 });
        let installOutput = '';
        let installError = '';
        let installSuccess = false;

        // Initialize enhanced analysis
        let currentAnalysis: ConflictAnalysis = {
            conflictingPackage: '',
            conflictingPackageCurrentVersion: '',
            satisfyingPackages: [],
            notSatisfying: [],
        };

        // Initialize reasoning recording to track AI upgrade decisions across attempts
        let reasoningRecording: ReasoningRecording = { updateMade: [] };

        while (attempt < maxAttempts && !installSuccess) {
            attempt++;
            logger.info(`Installation attempt ${attempt}/${maxAttempts}`);

            try {
                // Remove package-lock.json from tempDir before installation to force fresh resolution
                if (existsSync(tempPackageLockPath)) {
                    rmSync(tempPackageLockPath, { force: true });
                    logger.debug('Removed package-lock.json from temp directory for fresh resolution');
                }

                // Run npm install using enhanced utility
                const { stdout, stderr, success } = await installDependencies(tempDir);
                installOutput = stdout;
                installError = stderr;
                installSuccess = success;

                if (installSuccess) {
                    logger.info('Installation successful', { attempt });
                    break;
                }
            } catch (error) {
                // installDependencies throws on failure, so we capture the error
                installError = error instanceof Error ? error.message : String(error);
                installSuccess = false;
                logger.warn('Installation failed', { attempt, error: installError });
            }

            // If installation failed and we have more attempts, perform strategic analysis
            if (!installSuccess && attempt < maxAttempts) {
                logger.info('Performing strategic dependency analysis');

                // Parse install error to generate initial conflict analysis
                currentAnalysis = await parseInstallErrorToConflictAnalysis(installError);

                // Enhance analysis with ranking
                currentAnalysis = await hydrateConflictAnalysisWithRanking(currentAnalysis);

                // Enhance analysis with available versions from registry
                currentAnalysis = await hydrateConflictAnalysisWithRegistryData(currentAnalysis);

                const suggestions = generateStaticSuggestions(currentAnalysis, reasoningRecording);
                // Extract and update reasoning recording from AI response
                if (suggestions.reasoning && suggestions.reasoning.updateMade && Array.isArray(suggestions.reasoning.updateMade)) {
                    reasoningRecording.updateMade.push(...suggestions.reasoning.updateMade);
                    logger.info('Updated reasoning recording with Static Suggestions', {
                        newReasoningEntries: suggestions.reasoning.updateMade.length,
                        totalReasoningEntries: reasoningRecording.updateMade.length,
                        reasoningRecordingSuggestions: suggestions.reasoning.updateMade,
                    });
                }

                // Apply suggestions to package.json in tempDir
                packageJson = readPackageJson(tempDir);

                for (const suggestion of suggestions.suggestions) {
                    updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);
                    const targetDep = update_dependencies.find((dep) => dep.name === suggestion.name);
                    if (targetDep) {
                        // Update existing dependency with suggested version
                        targetDep.version = suggestion.version;
                        logger.info('Applied strategic suggestion (updated existing)', {
                            package: suggestion.name,
                            version: suggestion.version,
                            reason: suggestion.reason,
                            isDev: targetDep.isDev,
                        });
                    } else {
                        // Add new dependency suggested by strategic analysis
                        const newDep = {
                            name: suggestion.name,
                            version: suggestion.version,
                            isDev: suggestion.isDev,
                        };
                        update_dependencies.push(newDep);
                        logger.info('Applied strategic suggestion (added new)', {
                            package: suggestion.name,
                            version: suggestion.version,
                            reason: suggestion.reason,
                            isDev: suggestion.isDev,
                        });
                    }
                }

                writePackageJson(tempDir, packageJson);
            }
        }
        // #endregion

        // #region Step 4: Handle final result
        if (installSuccess) {
            // Copy updated files back to original location
            await cpAsync(tempPackageJsonPath, originalPackageJsonPath);
            logger.info('Copied updated package.json back to original location');

            if (existsSync(tempPackageLockPath)) {
                await cpAsync(tempPackageLockPath, originalPackageLockPath);
                logger.info('Copied updated package-lock.json back to original location');
            }

            // Log final reasoning chain for analysis
            logger.info('Final reasoning chain for successful resolution', {
                totalUpgrades: reasoningRecording.updateMade.length,
                upgrades: reasoningRecording.updateMade.map((u) => ({
                    package: `${u.package.name} (rank: ${u.package.rank})`,
                    versionChange: `${u.fromVersion} → ${u.toVersion}`,
                    dueToConflictWith: `${u.reason.name} (rank: ${u.reason.rank})`,
                })),
            });

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `✅ Successfully updated dependencies after ${attempt} attempt(s):\n\n` + `Updated packages:\n${update_dependencies.map((dep) => `- ${dep.name}@${dep.version}`).join('\n')}\n\n` + `Installation output:\n${installOutput.slice(-500)}`, // Last 500 chars to avoid overflow
                    },
                ],
            };
        } else {
            const errorMessage = `❌ Failed to resolve dependencies after ${maxAttempts} attempts.\n\n` + `Last error:\n${installError}\n\n` + `Please check the dependency versions and try again with compatible versions.`;

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: errorMessage,
                    },
                ],
            };
        }
        // #endregion
    } catch (error) {
        const errorMessage = `❌ Dependency resolution failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Dependency resolution failed', { error: errorMessage });

        return {
            content: [
                {
                    type: 'text' as const,
                    text: errorMessage,
                },
            ],
        };
    } finally {
        // Cleanup temporary directory
        if (tempDir) {
            try {
                rmSync(tempDir, { recursive: true, force: true });
                logger.debug('Successfully cleaned up temporary directory', { tempDir });
            } catch (cleanupError) {
                logger.warn('Failed to cleanup temporary directory', {
                    tempDir,
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                });
            }
        }
    }
};

export function registerDumbTools(server: McpServer) {
    server.registerTool(
        'dumb_resolver',
        {
            title: 'Dependency Resolver Update',
            description: 'Update package dependencies to specific versions and resolve their transitive dependencies automatically',
            inputSchema: dumbResolverInputSchema.shape,
        },
        dumbResolverHandler
    );
}
