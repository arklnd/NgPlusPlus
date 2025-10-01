#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from '@T/index.js';
import { registerAllResources } from '@R/index.js';
import { initializeLogger } from '@U/logger.utils.js';
import { LogLevel } from '@I/logger.interfaces.js';

// Initialize logger with appropriate configuration
const logger = initializeLogger({
    level: LogLevel.TRACE,
    enableFileLogging: true,
    logDirectory: '../logs',
    enableConsoleLogging: false, // Disable console logging to avoid interfering with MCP stdio
});

// Create server instance
const server = new McpServer({
    name: 'ngplusplus',
    version: '0.0.0',
});

logger.info('NgPlusPlus MCP Server initializing', 'main', {
    name: 'ngplusplus',
    version: '0.0.0',
});

// Register all tools
registerAllTools(server);
logger.info('All tools registered successfully', 'main');

// Register all resources
registerAllResources(server);
logger.info('All resources registered successfully', 'main');

// Start the server
async function main() {
    try {
        logger.info('Starting MCP server transport', 'main');
        const transport = new StdioServerTransport();
        await server.connect(transport);

        logger.info('NgPlusPlus MCP Server running on stdio', 'main', {
            logFile: logger.getLogFilePath(),
        });

        console.error('NgPlusPlus MCP Server running on stdio');
    } catch (error) {
        logger.error('Failed to start MCP server', 'main', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
    }
}

main().catch((error) => {
    logger.error('Fatal error in main()', 'main', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
    });

    console.error('Fatal error in main():', error);
    process.exit(1);
});
