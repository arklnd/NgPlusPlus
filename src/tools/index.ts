import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTools } from '@T/echo.tool';
import { registerNcuTools } from '@T/ncu.tool';
import { registerDependencyResolverTools } from '@T/dependency-resolver.tool';
import { getLogger } from '@U/logger.utils';

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(server: McpServer) {
    const logger = getLogger().child('tools');

    logger.info('Starting tool registration');

    logger.debug('Registering echo tools');
    registerEchoTools(server);

    logger.debug('Registering NCU tools');
    registerNcuTools(server);

    logger.debug('Registering dependency resolver tools');
    registerDependencyResolverTools(server);

    logger.info('All tools registered successfully');

    // Add more tool registrations here as you create them
    // registerOtherTools(server);
}
