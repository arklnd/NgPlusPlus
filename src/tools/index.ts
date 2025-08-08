import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTools } from './echo.tool.js';
import { registerNcuTools } from './ncu.tool.js';

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(server: McpServer) {
    registerEchoTools(server);
    registerNcuTools(server);

    // Add more tool registrations here as you create them
    // registerOtherTools(server);
}
