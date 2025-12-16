import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync, writeFileSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { simpleGit } from 'simple-git';
import { readPackageJson, writePackageJson, updateDependency, installDependencies, formatInstallError } from '@U/package-json.utils';
import { validatePackageVersionsExist } from '@U/package-registry.utils';
import { getOpenAIService } from '@S/openai.service';
import { parseAndStoreDependencyMap, getLogger, rectifyStrategicResponseWithDependentInfo } from '@U/index';
import OpenAI from 'openai';
import { analyzeDependencyConstraints, identifyBlockingPackages, ResolverAnalysis, generateUpgradeStrategies, createEnhancedSystemPrompt, createStrategicPrompt, categorizeError, logStrategicAnalysis, checkCompatibility, hydrateConflictAnalysisWithRegistryData, parseInstallErrorToConflictAnalysis, hydrateConflictAnalysisWithRanking, parseInstallErrorToConflictAnalysisStatically } from '@U/dumb-resolver-helper';
import { AIResponseFormatError, NoSuitableVersionFoundError, PackageVersionValidationError, NoNewSuggestionError } from '@E/index';
import { ConflictAnalysis, ReasoningRecording, updateMade } from '@I/index';
import deepEqual from 'fast-deep-equal';


const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

// Schema definitions
export const dependencyUpdateSchema = z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Target version'),
    isDev: z.boolean().default(false).describe('Whether this is a dev dependency'),
    reason: z.string().describe('Reason for the update'),
    fromVersion: z.string().describe('Current version of the package'),
});

export const dumbResolverInputSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
    update_dependencies: z.array(dependencyUpdateSchema).describe('List of dependencies to update with their target versions'),
    maxAttempts: z.number().min(1).default(200).describe('Maximum number of attempts for resolving dependencies'),
});

export type DumbResolverInput = z.infer<typeof dumbResolverInputSchema>;

const mkdtempAsync = promisify(mkdtemp);
const cpAsync = promisify(cp);

export const dumbResolverHandler = async (input: DumbResolverInput) => {
    const { repo_path, update_dependencies, maxAttempts } = input;
    const logger = getLogger().child('dumb-resolver');
    let attempt = 0;
    let tempDir: string | null = null;
    let installSuccess = false;
    let installOutput = '';
    let installError = '';
    let reasoningRecording: ReasoningRecording = { updateMade: [] };
    
    // File paths for cleanup
    let originalPackageJsonPath = '';
    let tempPackageJsonPath = '';
    let tempPackageLockPath = '';
    let originalPackageLockPath = '';
    let tempGitPath = '';
    let originalGitPath = '';

    try {
        logger.info('Starting dependency resolution', {
            repoPath: repo_path,
            dependencies: update_dependencies,
        });

        // Validate initial target dependency versions exist in registry before proceeding
        logger.info('Validating initial target dependency versions exist in registry');
        const validationResults = await validatePackageVersionsExist({ suggestions: update_dependencies, analysis: '', reasoning: { updateMade: [] } });
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

        originalPackageJsonPath = join(resolve(repo_path), 'package.json');
        tempPackageJsonPath = join(tempDir, 'package.json');
        tempPackageLockPath = join(tempDir, 'package-lock.json');
        originalPackageLockPath = join(resolve(repo_path), 'package-lock.json');
        tempGitPath = join(tempDir, '.git');
        originalGitPath = join(resolve(repo_path), '.git');

        if (!existsSync(originalPackageJsonPath)) {
            throw new Error(`package.json not found at ${originalPackageJsonPath}`);
        }

        // Copy package.json to temp directory
        await cpAsync(originalPackageJsonPath, tempPackageJsonPath);
        logger.debug('Copied package.json to temp directory');

        // Copy package-lock.json if it exists
        if (existsSync(originalPackageLockPath)) {
            await cpAsync(originalPackageLockPath, tempPackageLockPath);
            await parseAndStoreDependencyMap(originalPackageLockPath, originalPackageJsonPath);
            logger.debug('Copied package-lock.json to temp directory and parsed dependency map');
        }
        
        // Initialize git repository and add gitignore for node_modules
        const git = simpleGit(tempDir);
        await git.init();
        const gitignorePath = join(tempDir, '.gitignore');
        writeFileSync(gitignorePath, 'node_modules/\n*.log\n');
        logger.debug('Initialized git repository and created .gitignore');
        // #endregion

        // #region Step 1.5: ensure node_modules integrity in tempDir
        const { success: initialInstall } = await installDependencies(tempDir);
        if (!initialInstall) {
            throw new Error('initial npm install in temp directory failed, cannot ensure node_modules integrity');
        }
        
        // Commit initial install
        await git.add('.');
        await git.commit('Initial install to ensure integrity');
        logger.debug('Committed initial install to git');
        // endregion

        // #region Step 2: Read and update package.json with target dependencies
        let packageJson = await readPackageJson(tempDir);

        for (const dep of update_dependencies) {
            await updateDependency(packageJson, dep.name, dep.version, dep.isDev);
        }

        await writePackageJson(tempDir, packageJson);
        
        // Commit updated dependencies
        await git.add('.');
        await git.commit('Updated initial target dependencies in package.json');
        logger.debug('Committed updated dependencies to git');
        logger.info('Updated dependencies in temp package.json');
        // #endregion

        // #region Step 3: Attempt installation with retry logic
        const openai = getOpenAIService(); // vscode extension hack আর কাজ করছে না

        // Initialize enhanced analysis
        let currentAnalysis: ConflictAnalysis = {
            conflicts: [],
            allPackagesMentionedInError: [],
        };

        // Initialize reasoning recording to track AI upgrade decisions across attempts
        reasoningRecording = { updateMade: [] };

        // Initialize chat history for maintaining context across installation attempts
        const systemMessage = createEnhancedSystemPrompt();
        let chatHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemMessage },
            {
                role: 'user',
                content: `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT:\n${packageJson}\n\nTARGET UPGRADE GOALS:\n${update_dependencies.map((dep) => `- ${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n')}\n\nFocus on achieving these target upgrades through strategic blocker resolution.`,
            },
        ];

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
            if (!installSuccess) {
                logger.info('Performing strategic dependency analysis');

                // Parse install error to generate initial conflict analysis
                currentAnalysis = await parseInstallErrorToConflictAnalysisStatically(installError);

                // Enhance analysis with ranking
                currentAnalysis = await hydrateConflictAnalysisWithRanking(currentAnalysis);

                // Enhance analysis with available versions from registry
                currentAnalysis = await hydrateConflictAnalysisWithRegistryData(currentAnalysis);

                // Create strategic prompt with hydrated analysis context
                const strategicPrompt = createStrategicPrompt(
                    reasoningRecording,
                    installError,
                    currentAnalysis,
                    update_dependencies.map((dep) => `- ${dep.name} to version ${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n'),
                    attempt,
                    maxAttempts
                );
                // need to update :: end

                // Reset chat history with system message
                chatHistory = [{ role: 'system', content: systemMessage }];
                chatHistory.push({ role: 'user', content: `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT: \n${JSON.stringify(await readPackageJson(tempDir))}` });
                // Add current failure and analysis to chat history
                chatHistory.push({ role: 'user', content: strategicPrompt });

                // Try to get valid suggestions from OpenAI (with retry on invalid structure)
                let aiRetryAttempt = 0;
                const maxAiRetries = 5;
                let validSuggestions = false;

                while (aiRetryAttempt < maxAiRetries && !validSuggestions) {
                    aiRetryAttempt++;
                    let response = '';
                    try {
                        response = await openai.generateTextWithHistory(chatHistory, {
                            temperature: 0.3,
                            maxTokens: 1000,
                        });

                        // Add successful assistant response to chat history for future context
                        chatHistory.push({ role: 'assistant', content: response });

                        // Extract JSON from markdown code blocks if present
                        let jsonString = response.trim();
                        const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
                        if (jsonMatch) {
                            jsonString = jsonMatch[1].trim();
                        }

                        // Parse and validate OpenAI response structure
                        let suggestions = JSON.parse(jsonString);

                        // Validate response structure
                        if (!suggestions || typeof suggestions !== 'object') {
                            throw new AIResponseFormatError('Invalid response: not an object');
                        }

                        if (!suggestions.suggestions || !Array.isArray(suggestions.suggestions)) {
                            throw new AIResponseFormatError('Invalid response: missing or invalid suggestions array');
                        }

                        // Validate each suggestion
                        const invalidSuggestions = suggestions.suggestions.filter((s: any) => !s || typeof s !== 'object' || !s.name || !s.version || typeof s.isDev !== 'boolean');

                        if (invalidSuggestions.length > 0) {
                            throw new AIResponseFormatError(`Invalid suggestions found: ${invalidSuggestions.length} items missing name, version, or isDev`);
                        }

                        logger.debug('Parsed OpenAI suggestions : before rectification', { suggestions: suggestions });
                        // Rectify version suggestion using dependent package list
                        suggestions = await rectifyStrategicResponseWithDependentInfo(suggestions, currentAnalysis);
                        logger.debug('Parsed OpenAI suggestions : after rectification', { suggestions: suggestions });

                        // Validate version existence before applying suggestions
                        const validationResults = await validatePackageVersionsExist(suggestions);
                        const nonExistentVersions = validationResults.filter((r) => !r.exists);

                        if (nonExistentVersions.length > 0) {
                            const errorDetails = nonExistentVersions.map((r) => `${r.packageName}@${r.version}: ${r.error || 'Version not found'}`).join('\n');
                            const errorMessage = `Package version validation failed. The following suggested versions do not exist in the npm registry:\n${errorDetails}\n\nPlease suggest alternative versions that exist in the registry.`;

                            logger.warn('Some suggested package versions do not exist in registry', {
                                nonExistentVersions: nonExistentVersions.map((r) => `${r.packageName}@${r.version}`),
                                errors: nonExistentVersions.map((r) => r.error).filter(Boolean),
                            });

                            // Throw error so AI can handle it in the next iteration with better suggestions
                            throw new PackageVersionValidationError(errorMessage);
                        } else {
                            logger.info('All suggested package versions exist in registry');
                        }

                        logger.info('Received valid strategic suggestions', {
                            suggestions: suggestions.suggestions,
                            attempt: aiRetryAttempt,
                        });
                        validSuggestions = true;

                        // Extract and update reasoning recording from AI response
                        let reasoningDetails = '';
                        if (suggestions.reasoning?.updateMade && Array.isArray(suggestions.reasoning.updateMade) && suggestions.reasoning.updateMade.length > 0) {
                            reasoningRecording.updateMade.push(...suggestions.reasoning.updateMade);
                            const reasoningEntries = suggestions.reasoning.updateMade
                                .map((update: any) => `  - ${update.package.name} (rank: ${update.package.rank}): ${update.fromVersion} → ${update.toVersion} | Due to higher rank of: ${update.reason.name} (rank: ${update.reason.rank})`)
                                .join('\n');
                            reasoningDetails = `\n\n[🔗] Reasoning Chain Entry:\n${reasoningEntries}`;
                            logger.info('Updated reasoning recording with AI insights 🤖', {
                                newReasoningEntries: suggestions.reasoning.updateMade.length,
                                totalReasoningEntries: reasoningRecording.updateMade.length,
                                reasoningRecordingSuggestions: suggestions.reasoning.updateMade,
                            });
                        }

                        // Apply suggestions to package.json in tempDir
                        packageJson = await readPackageJson(tempDir);
                        const packageJsonBeforeSuggestions = JSON.parse(JSON.stringify(packageJson));

                        for (const suggestion of suggestions.suggestions) {
                            await updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);
                            const targetDep = update_dependencies.find((dep) => dep.name === suggestion.name);
                            if (targetDep) {
                                // Update existing dependency with suggested version
                                targetDep.version = suggestion.version;
                                logger.info('Applied strategic suggestion (updated existing)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    priority: suggestion.priority || 'target',
                                    isDev: targetDep.isDev,
                                });
                            } else {
                                // Add new dependency suggested by strategic analysis
                                update_dependencies.push(suggestion);
                                logger.info('Applied strategic suggestion (added new)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    priority: suggestion.priority || 'target',
                                    isDev: suggestion.isDev,
                                });
                            }
                        }

                        // Check if packageJson actually has any changes using deep equality comparison
                        if (deepEqual(packageJsonBeforeSuggestions, packageJson)) {
                            const errorMessage = 'AI suggested changes but package.json remains unchanged. This indicates the suggestions were redundant or ineffective.';
                            throw new NoNewSuggestionError(errorMessage);
                        }

                        logger.debug('Verified package.json has changes after applying suggestions');
                        await writePackageJson(tempDir, packageJson);
                        
                        // Commit AI strategic suggestions with detailed reasoning
                        await git.add('.');
                        const gitStatus = await git.status();
                        logger.debug('✔️ Git status before commit', { gitStatus });
                        
                        // Build enriched commit message with AI reasoning
                        const suggestionSummary = '[🧠] Suggestions:\n' + suggestions.suggestions
                            .map((s: any) => `  - ${s.name}@${s.version}${s.reason ? ` (${s.reason})` : ''}`)
                            .join('\n');
                        
                        // Add install error context (format each line with proper git commit message style)
                        const errorContext = installError 
                            ? `\n\n[💥] Error Context:\n${formatInstallError(installError)}`
                            : '';
                        
                        const commitMessage = `Applied AI strategic suggestions [attempt=${attempt}, aiRetry=${aiRetryAttempt}]\n\n${suggestionSummary}${reasoningDetails}${errorContext}`;
                        
                        await git.commit(commitMessage);
                        
                        // Get git log and pass to logger
                        const gitLog = await git.log({ maxCount: 10 });
                        logger.debug('✔️ Committed AI strategic suggestions to git', {
                            attempt, 
                            aiRetryAttempt,
                            recentCommits: gitLog.all.map(commit => ({
                                hash: commit.hash.substring(0, 7),
                                message: commit.message,
                                date: commit.date
                            }))
                        });

                        // Add summary of applied changes to chat history for next iteration context
                        const appliedChanges = suggestions.suggestions.map((s: any) => `${s.name}@${s.version}`).join(', ');
                        chatHistory.push({
                            role: 'user',
                            content: `Applied suggestions: ${appliedChanges}. Will now attempt installation with these changes.`,
                        });
                    } catch (aiError) {
                        const errorMsg = aiError instanceof Error ? aiError.message : String(aiError);
                        logger.warn(`OpenAI attempt ${aiRetryAttempt} failed`, { error: errorMsg, errorType: aiError instanceof Error ? aiError.name : 'Unknown' });

                        if (aiRetryAttempt < maxAiRetries) {
                            let retryMessage = '';

                            if (aiError instanceof AIResponseFormatError || aiError instanceof PackageVersionValidationError || aiError instanceof NoNewSuggestionError) {
                                validSuggestions = false;
                                retryMessage = aiError.getRetryMessage();
                            } else if (aiError instanceof NoSuitableVersionFoundError) {
                                throw aiError; // Let the main loop catch and handle this error
                            } else {
                                // Generic error handling for other types of errors
                                retryMessage = `An error occurred while processing your response: ${errorMsg}`;
                            }

                            chatHistory.push({ role: 'user', content: retryMessage });
                        } else {
                            logger.error('Failed to get valid OpenAI suggestions after retries', { error: errorMsg, errorType: aiError instanceof Error ? aiError.name : 'Unknown' });
                        }
                    }
                }
            }
        }
        // #endregion

    } catch (error) {
        const errorMessage = `❌ Dependency resolution failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Dependency resolution failed', { error: errorMessage });
        installSuccess = false;
        installError = error instanceof Error ? error.message : String(error);
    } finally {
        // #region Resource cleanup and copy-back (always executed)
        let copyBackSuccessful = false;
        let copyBackErrors: string[] = [];

        if (tempDir && (originalPackageJsonPath || tempPackageJsonPath)) {
            logger.info('Starting resource cleanup and copy-back process', {
                installSuccess,
                tempDir,
                attempt,
                maxAttempts
            });

            try {
                // Always attempt to copy back resources, regardless of install success/failure
                // This ensures any partial progress or intermediate states are preserved
                
                // Copy package.json back (most important file)
                if (tempPackageJsonPath && originalPackageJsonPath && existsSync(tempPackageJsonPath)) {
                    try {
                        await cpAsync(tempPackageJsonPath, originalPackageJsonPath);
                        logger.info('✅ Successfully copied package.json back to original location');
                    } catch (copyError) {
                        const error = `Failed to copy package.json: ${copyError instanceof Error ? copyError.message : String(copyError)}`;
                        copyBackErrors.push(error);
                        logger.error('❌ Failed to copy package.json back', { error });
                    }
                }

                // Copy package-lock.json back if it exists
                if (tempPackageLockPath && originalPackageLockPath && existsSync(tempPackageLockPath)) {
                    try {
                        await cpAsync(tempPackageLockPath, originalPackageLockPath);
                        logger.info('✅ Successfully copied package-lock.json back to original location');
                    } catch (copyError) {
                        const error = `Failed to copy package-lock.json: ${copyError instanceof Error ? copyError.message : String(copyError)}`;
                        copyBackErrors.push(error);
                        logger.error('❌ Failed to copy package-lock.json back', { error });
                    }
                }

                // Copy .git directory back if it exists (for git history preservation)
                if (tempGitPath && originalGitPath && existsSync(tempGitPath)) {
                    try {
                        // Remove existing .git directory if it exists
                        if (existsSync(originalGitPath)) {
                            rmSync(originalGitPath, { recursive: true, force: true });
                            logger.debug('Removed existing .git directory');
                        }
                        
                        // Use synchronous cp with recursive option for directory copying
                        cpSync(tempGitPath, originalGitPath, { recursive: true });
                        logger.info('✅ Successfully copied .git directory back to original location');
                    } catch (copyError) {
                        const error = `Failed to copy .git directory: ${copyError instanceof Error ? copyError.message : String(copyError)}`;
                        copyBackErrors.push(error);
                        logger.error('❌ Failed to copy .git directory back', { error });
                    }
                }

                copyBackSuccessful = copyBackErrors.length === 0;
                
                if (copyBackSuccessful) {
                    logger.info('✅ All resources successfully copied back to original location');
                } else {
                    logger.warn('⚠️ Resource copy-back completed with some errors', {
                        errorCount: copyBackErrors.length,
                        errors: copyBackErrors
                    });
                }

            } catch (cleanupError) {
                const error = `Unexpected error during resource copy-back: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`;
                copyBackErrors.push(error);
                logger.error('❌ Unexpected error during resource cleanup', { error });
            }
        }

        // Cleanup temporary directory
        if (tempDir) {
            try {
                rmSync(tempDir, { recursive: true, force: true });
                logger.debug('✅ Successfully cleaned up temporary directory', { tempDir });
            } catch (cleanupError) {
                logger.warn('⚠️ Failed to cleanup temporary directory', {
                    tempDir,
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                });
            }
        }
        // #endregion

        // #region Return appropriate response based on final state
        if (installSuccess && copyBackSuccessful) {
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
                        text: `✅ Successfully updated dependencies after ${attempt} attempt(s):\n\n` + 
                              `Updated packages:\n${update_dependencies.map((dep) => `- ${dep.name}@${dep.version}`).join('\n')}\n\n` + 
                              `Installation output:\n${installOutput.slice(-500)}`, // Last 500 chars to avoid overflow
                    },
                ],
            };
        } else if (installSuccess && !copyBackSuccessful) {
            // Installation succeeded but copy-back had issues
            const warningMessage = `⚠️ Dependencies were successfully resolved after ${attempt} attempt(s), but there were issues copying files back:\n\n` +
                                  `Updated packages:\n${update_dependencies.map((dep) => `- ${dep.name}@${dep.version}`).join('\n')}\n\n` +
                                  `Copy-back errors:\n${copyBackErrors.join('\n')}\n\n` +
                                  `Please check your files and ensure they are properly updated.\n\n` +
                                  `Installation output:\n${installOutput.slice(-500)}`;

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: warningMessage,
                    },
                ],
            };
        } else {
            // Installation failed or was interrupted
            const status = attempt >= maxAttempts ? `after ${maxAttempts} attempts` : `(interrupted after ${attempt} attempt(s))`;
            let errorMessage = `❌ Failed to resolve dependencies ${status}.\n\n`;

            if (installError) {
                errorMessage += `Last error:\n${installError}\n\n`;
            }

            if (copyBackErrors.length > 0) {
                errorMessage += `Additionally, there were issues during resource copy-back:\n${copyBackErrors.join('\n')}\n\n`;
            }

            errorMessage += `Please check the dependency versions and try again with compatible versions.`;
            logger.error('[❌] Dependency resolution ultimately failed', {
                installError,
                copyBackErrors,
                attempt,
                maxAttempts
            });
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
