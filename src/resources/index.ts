import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDemoResources } from '@R/demo.resource';
import { getLogger } from '@U/index';

/**
 * Register all resources with the MCP server
 */
export function registerAllResources(server: McpServer) {
    const logger = getLogger().child('resources');

    logger.info('Starting resource registration');

    logger.debug('Registering demo resources');
    registerDemoResources(server);

    logger.info('All resources registered successfully');

    // Add more resource registrations here as you create them
    // registerOtherResources(server);
}
