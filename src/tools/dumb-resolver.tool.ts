import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { readPackageJson, writePackageJson, updateDependency, installDependencies } from '@U/package-json.utils';
import { getOpenAIService } from '@S/openai.service';
import { getLogger } from '@U/index';
import OpenAI from 'openai';

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
    const maxAttempts = 50;
    let attempt = 0;
    let tempDir: string | null = null;

    try {
        logger.info('Starting dependency resolution', {
            repoPath: repo_path,
            dependencies: update_dependencies,
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
        const openai = getOpenAIService();
        openai.updateConfig({ model: 'copilot-gpt-4', baseURL: 'http://localhost:3000/v1/', maxTokens: 10000, timeout: 300000 });
        let installOutput = '';
        let installError = '';
        let success = false;

        // Initialize chat history for maintaining context across installation attempts
        const systemMessage = `You are an expert npm dependency resolver with a PRIMARY GOAL of upgrading packages to newer versions. Your task is to analyze dependency conflicts and suggest alternative versions that resolve conflicts while ALWAYS making progress towards newer, more recent versions.

CRITICAL INSTRUCTIONS:
1. NEVER suggest downgrading to older versions unless absolutely no other option exists
2. ALWAYS prioritize newer versions over older ones when resolving conflicts
3. If a conflict exists, find the NEWEST compatible versions that resolve it
4. Look for ways to upgrade transitive dependencies that might unlock newer versions
5. Consider using version ranges (^, ~) that allow for newer patch/minor versions
6. When multiple solutions exist, ALWAYS choose the one with newer package versions
7. If you must suggest an older version, explain why and suggest a path to upgrade later

Your suggestions should demonstrate clear progress towards more recent package versions. The user's intent is to modernize their dependency tree, not maintain old versions.

Always respond with valid JSON format containing suggestions and analysis.`;
        let chatHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemMessage },
            { 
                role: 'user', 
                content: `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT:
${originalPackageJson}

This is the current state of dependencies before any updates. Use this context to make informed upgrade decisions.` 
            }
        ];

        while (attempt < maxAttempts && !success) {
            attempt++;
            logger.info(`Installation attempt ${attempt}/${maxAttempts}`);

            try {
                // Run npm install using enhanced utility
                const { stdout, stderr, success: installSuccess } = await installDependencies(tempDir);
                installOutput = stdout;
                installError = stderr;
                success = installSuccess;

                if (success) {
                    logger.info('Installation successful', { attempt });
                    break;
                }
            } catch (error) {
                // installDependencies throws on failure, so we capture the error
                installError = error instanceof Error ? error.message : String(error);
                success = false;
                logger.warn('Installation failed', { attempt, error: installError });
            }

            // If installation failed and we have more attempts, ask OpenAI for suggestions
            if (!success && attempt < maxAttempts) {
                logger.info('Asking OpenAI for alternative solutions');

                const userMessage = `
The following npm install failed. Attempt: ${attempt}/${maxAttempts} failed:

Dependencies being updated:
${update_dependencies.map((dep) => `${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n')}

Error output:
${installError}

Standard output:
${installOutput}

Please suggest alternative versions or solutions to resolve this dependency conflict. Use the original package.json context provided earlier to make informed upgrade decisions. Respond with JSON format:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version",
      "isDev": true/false,
      "reason": "explanation for this version"
    }
  ],
  "analysis": "brief analysis of the conflict"
}

For each suggestion, set isDev to true if it's a development dependency (like typescript, @types/*, testing tools, build tools, linters, and definitely not limited to these only) or false if it's a production dependency.`;

                // Add current failure to chat history
                chatHistory.push({ role: 'user', content: userMessage });

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
                        const jsonMatch = jsonString.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
                        if (jsonMatch) {
                            jsonString = jsonMatch[1].trim();
                        }

                        // Parse and validate OpenAI response structure
                        const suggestions = JSON.parse(jsonString);

                        // Validate response structure
                        if (!suggestions || typeof suggestions !== 'object') {
                            throw new Error('Invalid response: not an object');
                        }

                        if (!suggestions.suggestions || !Array.isArray(suggestions.suggestions)) {
                            throw new Error('Invalid response: missing or invalid suggestions array');
                        }

                        // Validate each suggestion
                        const invalidSuggestions = suggestions.suggestions.filter((s: any) => !s || typeof s !== 'object' || !s.name || !s.version || typeof s.isDev !== 'boolean');

                        if (invalidSuggestions.length > 0) {
                            throw new Error(`Invalid suggestions found: ${invalidSuggestions.length} items missing name, version, or isDev`);
                        }

                        logger.info('Received valid OpenAI suggestions', { suggestions, attempt: aiRetryAttempt });
                        validSuggestions = true;

                        // Update package.json with suggested versions
                        packageJson = readPackageJson(tempDir);

                        for (const suggestion of suggestions.suggestions) {
                            updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);
                            const targetDep = update_dependencies.find((dep) => dep.name === suggestion.name);
                            if (targetDep) {
                                // Update existing dependency with suggested version
                                targetDep.version = suggestion.version;
                                logger.info('Applied OpenAI suggestion (updated existing)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    isDev: targetDep.isDev,
                                });
                            } else {
                                // Add new dependency suggested by OpenAI
                                update_dependencies.push(suggestion);
                                logger.info('Applied OpenAI suggestion (added new)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    isDev: suggestion.isDev,
                                });
                            }
                        }

                        writePackageJson(tempDir, packageJson);
                        
                        // Add summary of applied changes to chat history for next iteration context
                        const appliedChanges = suggestions.suggestions.map((s: any) => `${s.name}@${s.version}`).join(', ');
                        chatHistory.push({ 
                            role: 'user', 
                            content: `Applied suggestions: ${appliedChanges}. Will now attempt installation with these changes.` 
                        });
                    } catch (aiError) {
                        const errorMsg = aiError instanceof Error ? aiError.message : String(aiError);
                        logger.warn(`OpenAI attempt ${aiRetryAttempt} failed`, { error: errorMsg });

                        if (aiRetryAttempt < maxAiRetries) {
                            // Add assistant response and user retry message to chat history
                            // chatHistory.push({ role: 'assistant', content: response || 'Failed to generate response' });
                            const retryMessage = `IMPORTANT: Previous response was invalid. Please ensure your response is valid JSON with this exact structure:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version",
      "isDev": true/false,
      "reason": "explanation for this version"
    }
  ],
  "analysis": "brief analysis of the conflict"
}

For each suggestion, set isDev to true if it's a development dependency (like typescript, @types/*, testing tools, build tools, linters, and definitely not limited to these only) or false if it's a production dependency.`;
                            
                            chatHistory.push({ role: 'user', content: retryMessage });
                        } else {
                            logger.error('Failed to get valid OpenAI suggestions after retries', { error: errorMsg });
                        }
                    }
                }
            }
        }
        // #endregion

        // #region Step 4: Handle final result
        if (success) {
            // Copy updated files back to original location
            await cpAsync(tempPackageJsonPath, originalPackageJsonPath);
            logger.info('Copied updated package.json back to original location');

            if (existsSync(tempPackageLockPath)) {
                await cpAsync(tempPackageLockPath, originalPackageLockPath);
                logger.info('Copied updated package-lock.json back to original location');
            }

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
