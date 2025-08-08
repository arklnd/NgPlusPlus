import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

/**
 * Base schema for NCU operations that require a repository path
 */
const BaseNcuSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json')
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
        doctor: z.boolean().default(false).describe('Run ncu --doctor to check for breaking changes')
    }),
    // More schemas can be added as needed
} as const;

/**
 * NCU tool names enum
 */
export enum NcuTools {
    CHECK = 'ncu_check',
    UPDATE = 'ncu_update'
    // More tools can be added as needed
}

/**
 * Validates if a given path contains a valid Node.js project
 * by checking for package.json file
 */
export function validateProjectPath(repoPath: string): { isValid: boolean; error?: string } {
    try {
        const absolutePath = resolve(repoPath);
        
        if (!existsSync(absolutePath)) {
            return { isValid: false, error: `Path does not exist: ${absolutePath}` };
        }
        
        const packageJsonPath = join(absolutePath, 'package.json');
        if (!existsSync(packageJsonPath)) {
            return { isValid: false, error: `No package.json found in: ${absolutePath}` };
        }
        
        // Try to parse package.json to ensure it's valid
        try {
            const packageJson = readFileSync(packageJsonPath, 'utf8');
            JSON.parse(packageJson);
        } catch (parseError) {
            return { isValid: false, error: `Invalid package.json in: ${absolutePath}` };
        }
        
        return { isValid: true };
    } catch (error) {
        return { isValid: false, error: `Error validating path: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/**
 * Get the absolute path for a repository, handling both relative and absolute paths
 */
export function getRepositoryPath(repoPath: string): string {
    return resolve(repoPath);
}

/**
 * Common repository path validation and resolution for NCU tools
 */
export async function validateAndResolveRepoPath(repoPath: string): Promise<{ success: boolean; resolvedPath?: string; error?: string }> {
    try {
        const resolvedPath = getRepositoryPath(repoPath);
        const validation = validateProjectPath(resolvedPath);
        
        if (!validation.isValid) {
            return { success: false, error: validation.error };
        }
        
        return { success: true, resolvedPath };
    } catch (error) {
        return { 
            success: false, 
            error: `Failed to resolve repository path: ${error instanceof Error ? error.message : String(error)}` 
        };
    }
}

/**
 * Execute npm-check-updates command
 */
async function executeNcu(args: string[], cwd: string): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
        // Find the ncu executable in node_modules
        const ncuPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'ncu.cmd' : 'ncu');
        
        // Check if ncu exists in node_modules
        if (!existsSync(ncuPath)) {
            resolve({
                success: false,
                output: '',
                error: 'npm-check-updates not found in node_modules. Please install it first with: npm install npm-check-updates'
            });
            return;
        }

        const child = spawn(ncuPath, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
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
            if (code === 0) {
                resolve({ success: true, output: stdout });
            } else {
                resolve({
                    success: false,
                    output: stdout,
                    error: stderr || `Process exited with code ${code}`
                });
            }
        });

        child.on('error', (error) => {
            resolve({
                success: false,
                output: '',
                error: `Failed to execute ncu: ${error.message}`
            });
        });
    });
}

/**
 * Execute NCU update command
 */
async function ncuUpdate(params: z.infer<typeof NcuSchemas.update>): Promise<{ success: boolean; message: string; details?: string }> {
    const { repo_path, target, upgrade, doctor } = params;
    
    // Validate and resolve repository path
    const pathResult = await validateAndResolveRepoPath(repo_path);
    if (!pathResult.success) {
        return { success: false, message: pathResult.error! };
    }

    // Build ncu command arguments
    const args: string[] = [];
    
    if (upgrade) {
        args.push('-u'); // Update package.json
    }
    
    if (doctor) {
        args.push('--doctor'); // Doctor mode
    }
    
    if (target) {
        args.push(target); // Specific package
    }

    // Execute ncu command
    const result = await executeNcu(args, pathResult.resolvedPath!);
    
    if (result.success) {
        return {
            success: true,
            message: upgrade ? 'Package dependencies updated successfully' : 'Package check completed successfully',
            details: result.output
        };
    } else {
        return {
            success: false,
            message: 'NCU command failed',
            details: result.error || result.output
        };
    }
}

/**
 * Register ncu tools with the MCP server
 */
export function registerNcuTools(server: McpServer) {
    // Register NCU Update tool
    server.registerTool(
        NcuTools.UPDATE,
        {
            title: 'NCU Update Tool',
            description: 'Update package dependencies using npm-check-updates (ncu -u). This tool checks for newer versions of dependencies and updates package.json accordingly.',
            inputSchema: NcuSchemas.update.shape,
        },
        async ({ repo_path, target, upgrade = true, doctor = false }) => {
            try {
                const params = { repo_path, target, upgrade, doctor };
                const result = await ncuUpdate(params);
                
                if (result.success) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `✅ ${result.message}\n\n${result.details || ''}`
                            }
                        ]
                    };
                } else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `❌ ${result.message}\n\n${result.details || ''}`
                            }
                        ],
                        isError: true
                    };
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}