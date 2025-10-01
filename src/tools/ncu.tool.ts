import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { getLogger } from '../utils/index.js';

/**
 * Base schema for NCU operations that require a repository path
 */
const BaseNcuSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
});

/**
 * Schema definitions for different NCU operations
 */
export const NcuSchemas = {
    check: BaseNcuSchema.extend({
        // Additional fields for checking updates will be added here
    }),
    update: BaseNcuSchema.extend({
        target: z.string().optional().describe('Specific package to update (optional, updates all if not specified)'),
        upgrade: z.boolean().default(true).describe('Whether to upgrade packages (equivalent to -u flag)'),
        doctor: z.boolean().default(false).describe('Run ncu --doctor to check for breaking changes'),
    }),
    // More schemas can be added as needed
} as const;

/**
 * NCU tool names enum
 */
export enum NcuTools {
    CHECK = 'ncu_check',
    UPDATE = 'ncu_update',
    // More tools can be added as needed
}

/**
 * Validates if a given path contains a valid Node.js project
 * by checking for package.json file
 */
export function validateProjectPath(repoPath: string): { isValid: boolean; error?: string } {
    const logger = getLogger().child('ncu:validate');

    logger.debug('Validating project path', { repoPath });

    try {
        const absolutePath = resolve(repoPath);

        if (!existsSync(absolutePath)) {
            const error = `Path does not exist: ${absolutePath}`;
            logger.warn('Path validation failed - path not found', { absolutePath });
            return { isValid: false, error };
        }

        const packageJsonPath = join(absolutePath, 'package.json');
        if (!existsSync(packageJsonPath)) {
            const error = `No package.json found in: ${absolutePath}`;
            logger.warn('Path validation failed - no package.json', { absolutePath });
            return { isValid: false, error };
        }

        // Try to parse package.json to ensure it's valid
        try {
            const packageJson = readFileSync(packageJsonPath, 'utf8');
            JSON.parse(packageJson);
            logger.debug('Project path validation successful', { absolutePath });
        } catch (parseError) {
            const error = `Invalid package.json in: ${absolutePath}`;
            logger.error('Path validation failed - invalid package.json', {
                absolutePath,
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
            });
            return { isValid: false, error };
        }

        return { isValid: true };
    } catch (error) {
        const errorMsg = `Error validating path: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Unexpected error during path validation', {
            repoPath,
            error: error instanceof Error ? error.message : String(error),
        });
        return { isValid: false, error: errorMsg };
    }
}

/**
 * Common repository path validation and resolution for NCU tools
 */
export async function validateAndResolveRepoPath(repoPath: string): Promise<{ success: boolean; resolvedPath?: string; error?: string }> {
    const logger = getLogger().child('ncu:validate');

    logger.debug('Validating and resolving repository path', { repoPath });

    try {
        const resolvedPath = resolve(repoPath);
        logger.trace('Path resolved', { original: repoPath, resolved: resolvedPath });

        const validation = validateProjectPath(resolvedPath);

        if (!validation.isValid) {
            logger.warn('Repository path validation failed', {
                resolvedPath,
                error: validation.error,
            });
            return { success: false, error: validation.error };
        }

        logger.debug('Repository path validation successful', { resolvedPath });
        return { success: true, resolvedPath };
    } catch (error) {
        const errorMsg = `Failed to resolve repository path: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Error resolving repository path', {
            repoPath,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            error: errorMsg,
        };
    }
}

/**
 * Execute npm-check-updates command
 */
async function executeNcu(args: string[], cwd: string): Promise<{ success: boolean; output: string; error?: string }> {
    const logger = getLogger().child('ncu:execute');

    logger.debug('Executing NCU command', { args, cwd });

    return new Promise((resolve) => {
        // Find the ncu executable in node_modules
        const ncuPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'ncu.cmd' : 'ncu');

        logger.debug('Looking for NCU executable', { ncuPath });

        // Check if ncu exists in node_modules
        if (!existsSync(ncuPath)) {
            const errorMsg = 'npm-check-updates not found in node_modules. Please install it first with: npm install npm-check-updates';
            logger.error('NCU executable not found', { ncuPath });

            resolve({
                success: false,
                output: '',
                error: errorMsg,
            });
            return;
        }

        logger.info('Starting NCU process', { ncuPath, args, cwd });

        const child = spawn(ncuPath, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            logger.debug('NCU process completed', { code, stdoutLength: stdout.length, stderrLength: stderr.length });

            if (code === 0) {
                logger.info('NCU command executed successfully');
                resolve({ success: true, output: stdout });
            } else {
                logger.warn('NCU command failed', { code, stderr });
                resolve({
                    success: false,
                    output: stdout,
                    error: stderr || `Process exited with code ${code}`,
                });
            }
        });

        child.on('error', (error) => {
            logger.error('NCU process error', { error: error.message });
            resolve({
                success: false,
                output: '',
                error: `Failed to execute ncu: ${error.message}`,
            });
        });
    });
}

/**
 * Execute NCU update command
 */
async function ncuUpdate(params: z.infer<typeof NcuSchemas.update>): Promise<{ success: boolean; message: string; details?: string }> {
    const logger = getLogger().child('ncu:update');
    const { repo_path, target, upgrade, doctor } = params;

    logger.info('Starting NCU update', { repo_path, target, upgrade, doctor });

    // Validate and resolve repository path
    const pathResult = await validateAndResolveRepoPath(repo_path);
    if (!pathResult.success) {
        logger.error('Repository path validation failed', { repo_path, error: pathResult.error });
        return { success: false, message: pathResult.error! };
    }

    logger.debug('Repository path validated', { resolvedPath: pathResult.resolvedPath });

    // Build ncu command arguments
    const args: string[] = [];

    if (upgrade) {
        args.push('-u'); // Update package.json
        logger.trace('Added upgrade flag to NCU arguments');
    }

    if (doctor) {
        args.push('--doctor'); // Doctor mode
        logger.trace('Added doctor flag to NCU arguments');
    }

    if (target) {
        args.push(target); // Specific package
        logger.trace('Added target package to NCU arguments', { target });
    }

    logger.debug('NCU command arguments prepared', { args });

    // Execute ncu command
    const startTime = Date.now();
    const result = await executeNcu(args, pathResult.resolvedPath!);
    const executionTime = Date.now() - startTime;

    logger.info('NCU command execution completed', {
        success: result.success,
        executionTimeMs: executionTime,
        outputLength: result.output?.length || 0,
    });

    if (result.success) {
        logger.info('NCU update successful', { upgrade, target });
        return {
            success: true,
            message: upgrade ? 'Package dependencies updated successfully' : 'Package check completed successfully',
            details: result.output,
        };
    } else {
        logger.warn('NCU update failed', { error: result.error });
        return {
            success: false,
            message: 'NCU command failed',
            details: result.error || result.output,
        };
    }
}

/**
 * Register ncu tools with the MCP server
 */
export function registerNcuTools(server: McpServer) {
    const logger = getLogger().child('ncu-tool');

    logger.info('Registering NCU tools');

    // Register NCU Update tool
    server.registerTool(
        NcuTools.UPDATE,
        {
            title: 'NCU Update Tool',
            description: 'Update package dependencies using npm-check-updates (ncu -u). This tool checks for newer versions of dependencies and updates package.json accordingly.',
            inputSchema: NcuSchemas.update.shape,
        },
        async ({ repo_path, target, upgrade = true, doctor = false }) => {
            const requestId = Math.random().toString(36).substr(2, 9);

            logger.info('NCU update tool invoked', {
                requestId,
                repo_path,
                target,
                upgrade,
                doctor,
            });

            try {
                const startTime = Date.now();
                const params = { repo_path, target, upgrade, doctor };
                const result = await ncuUpdate(params);
                const executionTime = Date.now() - startTime;

                logger.info('NCU update tool completed', {
                    requestId,
                    success: result.success,
                    executionTimeMs: executionTime,
                });

                if (result.success) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `✅ ${result.message}\n\n${result.details || ''}`,
                            },
                        ],
                    };
                } else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `❌ ${result.message}\n\n${result.details || ''}`,
                            },
                        ],
                        isError: true,
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                logger.error('NCU update tool failed', {
                    requestId,
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : undefined,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Unexpected error: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    logger.info('NCU tools registered successfully');
}
