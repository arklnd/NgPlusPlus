import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { 
    readPackageJson, 
    writePackageJson, 
    updateDependency,
    installDependencies 
} from '@U/package-json.utils';
import { getOpenAIService } from '@S/openai.service';
import { getLogger } from '@U/index';

// Schema definitions
const dependencyUpdateSchema = z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Target version'),
    isDev: z.boolean().default(false).describe('Whether this is a dev dependency'),
});

const dumbResolverInputSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
    update_dependencies: z
        .array(dependencyUpdateSchema)
        .describe('List of dependencies to update with their target versions'),
});

type DumbResolverInput = z.infer<typeof dumbResolverInputSchema>;

const mkdtempAsync = promisify(mkdtemp);
const cpAsync = promisify(cp);

const dumbResolverHandler = async (input: DumbResolverInput) => {
    const { repo_path, update_dependencies } = input;
    const logger = getLogger().child('dumb-resolver');
    const maxAttempts = 3;
    let attempt = 0;
    let tempDir: string | null = null;

    try {
        logger.info('Starting dependency resolution', { 
            repoPath: repo_path, 
            dependencies: update_dependencies 
        });

        // Step 1: Create temporary directory and copy package.json
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

        // Step 2: Read and update package.json with target dependencies
        let packageJson = readPackageJson(tempDir);
        
        for (const dep of update_dependencies) {
            updateDependency(packageJson, dep.name, dep.version, dep.isDev);
        }

        writePackageJson(tempDir, packageJson);
        logger.info('Updated dependencies in temp package.json');

        // Step 3: Attempt installation with retry logic
        const openai = getOpenAIService();
        let installOutput = '';
        let installError = '';
        let success = false;

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

                let prompt = `
The following npm install failed:

Dependencies being updated:
${update_dependencies.map(dep => `${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n')}

Error output:
${installError}

Standard output:
${installOutput}

Please suggest alternative versions or solutions to resolve this dependency conflict. Respond with JSON format:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version",
      "reason": "explanation for this version"
    }
  ],
  "analysis": "brief analysis of the conflict"
}
`;

                // Try to get valid suggestions from OpenAI (with retry on invalid structure)
                let aiRetryAttempt = 0;
                const maxAiRetries = 2;
                let validSuggestions = false;

                while (aiRetryAttempt < maxAiRetries && !validSuggestions) {
                    aiRetryAttempt++;
                    try {
                        const response = await openai.generateText(prompt, {
                            temperature: 0.3,
                            maxTokens: 1000
                        });

                        // Parse and validate OpenAI response structure
                        const suggestions = JSON.parse(response);
                        
                        // Validate response structure
                        if (!suggestions || typeof suggestions !== 'object') {
                            throw new Error('Invalid response: not an object');
                        }
                        
                        if (!suggestions.suggestions || !Array.isArray(suggestions.suggestions)) {
                            throw new Error('Invalid response: missing or invalid suggestions array');
                        }

                        // Validate each suggestion
                        const invalidSuggestions = suggestions.suggestions.filter((s: any) => 
                            !s || typeof s !== 'object' || !s.name || !s.version
                        );
                        
                        if (invalidSuggestions.length > 0) {
                            throw new Error(`Invalid suggestions found: ${invalidSuggestions.length} items missing name or version`);
                        }

                        logger.info('Received valid OpenAI suggestions', { suggestions, attempt: aiRetryAttempt });
                        validSuggestions = true;

                        // Update package.json with suggested versions
                        packageJson = readPackageJson(tempDir);
                        
                        for (const suggestion of suggestions.suggestions) {
                            const targetDep = update_dependencies.find(dep => dep.name === suggestion.name);
                            if (targetDep) {
                                updateDependency(packageJson, suggestion.name, suggestion.version, targetDep.isDev);
                                logger.info('Applied OpenAI suggestion', { 
                                    package: suggestion.name, 
                                    version: suggestion.version,
                                    reason: suggestion.reason 
                                });
                            }
                        }

                        writePackageJson(tempDir, packageJson);

                    } catch (aiError) {
                        const errorMsg = aiError instanceof Error ? aiError.message : String(aiError);
                        logger.warn(`OpenAI attempt ${aiRetryAttempt} failed`, { error: errorMsg });
                        
                        if (aiRetryAttempt < maxAiRetries) {
                            // Update prompt for retry to be more specific about format
                            prompt += `\n\nIMPORTANT: Previous response was invalid. Please ensure your response is valid JSON with this exact structure:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version", 
      "reason": "explanation for this version"
    }
  ],
  "analysis": "brief analysis of the conflict"
}`;
                        } else {
                            logger.error('Failed to get valid OpenAI suggestions after retries', { error: errorMsg });
                        }
                    }
                }
            }
        }

        // Step 4: Handle final result
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
                        text: `✅ Successfully updated dependencies after ${attempt} attempt(s):\n\n` +
                              `Updated packages:\n${update_dependencies.map(dep => `- ${dep.name}@${dep.version}`).join('\n')}\n\n` +
                              `Installation output:\n${installOutput.slice(-500)}` // Last 500 chars to avoid overflow
                    }
                ]
            };
        } else {
            const errorMessage = `❌ Failed to resolve dependencies after ${maxAttempts} attempts.\n\n` +
                               `Last error:\n${installError}\n\n` +
                               `Please check the dependency versions and try again with compatible versions.`;
            
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: errorMessage
                    }
                ]
            };
        }

    } catch (error) {
        const errorMessage = `❌ Dependency resolution failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Dependency resolution failed', { error: errorMessage });
        
        return {
            content: [
                {
                    type: 'text' as const,
                    text: errorMessage
                }
            ]
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
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) 
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
