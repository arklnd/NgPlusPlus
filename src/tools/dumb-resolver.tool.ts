import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { readPackageJson, writePackageJson, updateDependency, installDependencies } from '@U/package-json.utils';
import { validatePackageVersionsExist, getPackageData } from '@U/package-registry.utils';
import { getOpenAIService } from '@S/openai.service';
import { getLogger } from '@U/index';
import OpenAI from 'openai';
import { analyzeDependencyConstraints, identifyBlockingPackages, ResolverAnalysis, generateUpgradeStrategies, createEnhancedSystemPrompt, createStrategicPrompt, categorizeError, logStrategicAnalysis, checkCompatibility, createDependencyParsingPrompt } from '@U/dumb-resolver-helper';
import { AIResponseFormatError, PackageVersionValidationError } from '@E/index';
import { ConflictAnalysis, ReasoningRecording, updateMade } from '@I/index';
import { getCleanVersion } from '@U/version.utils';
import * as semver from 'semver';

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

        // Initialize chat history for maintaining context across installation attempts
        const systemMessage = createEnhancedSystemPrompt();
        let chatHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemMessage },
            {
                role: 'user',
                content: `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT:
${originalPackageJson}

TARGET UPGRADE GOALS:
${update_dependencies.map((dep) => `- ${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n')}

This is the current state before any updates. Focus on achieving these target upgrades through strategic blocker resolution.`,
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
            if (!installSuccess && attempt < maxAttempts) {
                logger.info('Performing strategic dependency analysis');

                // Create parsing prompt for AI
                const parsingPrompt = createDependencyParsingPrompt(installError);

                // Analyze the error output for constraints and blockers
                let parsingResponse = await openai.generateText(parsingPrompt);
                parsingResponse = parsingResponse.trim();
                let jsonString = parsingResponse.trim();
                const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
                if (jsonMatch) {
                    jsonString = jsonMatch[1].trim();
                    currentAnalysis = JSON.parse(jsonString);
                }

                // Enhance analysis with available versions from registry
                logger.info('Fetching available versions for packages involved in conflict');
                try {
                    // Get unique package names involved in the conflict
                    const packagesToFetch = new Map<string, string>();

                    // Add conflicting package
                    if (currentAnalysis.conflictingPackage) {
                        packagesToFetch.set(currentAnalysis.conflictingPackage, currentAnalysis.conflictingPackageCurrentVersion);
                    }

                    // Add satisfying packages
                    currentAnalysis.satisfyingPackages?.forEach((pkg) => {
                        if (pkg.packageName) {
                            packagesToFetch.set(pkg.packageName, pkg.packageVersion);
                        }
                    });

                    // Add non-satisfying packages
                    currentAnalysis.notSatisfying?.forEach((pkg) => {
                        if (pkg.packageName) {
                            packagesToFetch.set(pkg.packageName, pkg.packageVersion);
                        }
                    });

                    // Fetch available versions for all packages in parallel
                    const versionFetchPromises = Array.from(packagesToFetch).map(async ([packageName, currentVersion]) => {
                        try {
                            logger.debug('Fetching available versions for package', { package: packageName });
                            const registryData = await getPackageData(packageName);
                            const allVersions = registryData.versions || [];

                            // Filter to only include versions newer than current version
                            const cleanCurrentVersion = getCleanVersion(currentVersion);
                            let versions = allVersions;

                            if (cleanCurrentVersion) {
                                versions = allVersions.filter((version) => {
                                    try {
                                        return semver.gt(version, cleanCurrentVersion);
                                    } catch (error) {
                                        logger.warn('Failed to compare versions', {
                                            package: packageName,
                                            version,
                                            currentVersion,
                                            error: error instanceof Error ? error.message : String(error),
                                        });
                                        return false;
                                    }
                                });

                                logger.debug('Filtered versions to newer ones only', {
                                    package: packageName,
                                    currentVersion,
                                    totalVersions: allVersions.length,
                                    newerVersions: versions.length,
                                });
                            } else {
                                logger.warn('Could not parse current version, using all available versions', {
                                    package: packageName,
                                    currentVersion,
                                });
                            }

                            logger.trace('Fetched newer versions for package', { package: packageName, versionCount: versions.length });
                            return { packageName, versions };
                        } catch (error) {
                            logger.warn('Failed to fetch versions for package', {
                                package: packageName,
                                error: error instanceof Error ? error.message : String(error),
                            });
                            return { packageName, versions: [] };
                        }
                    });

                    const versionResults = await Promise.all(versionFetchPromises);
                    const packageVersionMap = new Map(versionResults.map((result) => [result.packageName, result.versions]));

                    // hydrate conflicting package with available versions
                    if (currentAnalysis.conflictingPackage && packageVersionMap.has(currentAnalysis.conflictingPackage)) {
                        currentAnalysis.conflictingPackageAvailableVersions = packageVersionMap.get(currentAnalysis.conflictingPackage);
                    }

                    // hydrate satisfying packages with available versions
                    currentAnalysis.satisfyingPackages =
                        currentAnalysis.satisfyingPackages?.map((pkg) => ({
                            ...pkg,
                            availableVersions: packageVersionMap.get(pkg.packageName) || [],
                        })) || [];

                    // hydrate non-satisfying packages with available versions
                    currentAnalysis.notSatisfying =
                        currentAnalysis.notSatisfying?.map((pkg) => ({
                            ...pkg,
                            availableVersions: packageVersionMap.get(pkg.packageName) || [],
                        })) || [];

                    logger.info('Successfully hydrated conflict analysis with available versions', {
                        conflictingPackage: currentAnalysis.conflictingPackage,
                        conflictingPackageVersionCount: currentAnalysis.conflictingPackageAvailableVersions?.length || 0,
                        satisfyingPackagesCount: currentAnalysis.satisfyingPackages?.length || 0,
                        notSatisfyingPackagesCount: currentAnalysis.notSatisfying?.length || 0,
                        totalPackagesFetched: packagesToFetch.size,
                    });
                } catch (error) {
                    logger.error('Failed to hydrate conflict analysis with registry data', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                    // Continue with original analysis if registry fetch fails
                }

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
                        const suggestions = JSON.parse(jsonString);

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

                        // Extract and update reasoning recording from AI response
                        if (suggestions.reasoning && suggestions.reasoning.updateMade && Array.isArray(suggestions.reasoning.updateMade)) {
                            reasoningRecording.updateMade.push(...suggestions.reasoning.updateMade);
                            logger.info('Updated reasoning recording with AI insights', {
                                newReasoningEntries: suggestions.reasoning.updateMade.length,
                                totalReasoningEntries: reasoningRecording.updateMade.length,
                                reasoningRecordingSuggestions: suggestions.reasoning.updateMade,
                            });
                        }

                        // Validate version existence before applying suggestions
                        const validationUpdates = suggestions.suggestions.map((s: any) => ({
                            name: s.name,
                            version: s.version,
                            isDev: s.isDev,
                        }));

                        const validationResults = await validatePackageVersionsExist(validationUpdates);
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
                                    priority: suggestion.priority || 'target',
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
                                    priority: suggestion.priority || 'target',
                                    isDev: suggestion.isDev,
                                });
                            }
                        }

                        writePackageJson(tempDir, packageJson);

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

                            if (aiError instanceof AIResponseFormatError) {
                                retryMessage = aiError.getRetryMessage();
                            } else if (aiError instanceof PackageVersionValidationError) {
                                retryMessage = aiError.getRetryMessage();
                            } else {
                                // Generic error handling for other types of errors
                                retryMessage = `An error occurred while processing your response: ${errorMsg}
                                \n\nPlease provide a valid JSON response with the required structure and ensure all package versions exist in the npm registry.`;
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
