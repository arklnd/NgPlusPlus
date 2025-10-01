import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTools } from './echo.tool.js';
import { registerNcuTools } from './ncu.tool.js';
import { registerDependencyResolverTools } from './dependency-resolver.tool.js';
import { getLogger } from '../utils/index.js';

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
