import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getLogger } from '../utils/index.js';

/**
 * Demo data for the MCP resources
 */
const demoData = {
    users: [
        { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
        { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' },
        { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' },
    ],
    projects: [
        {
            id: 1,
            name: 'NgPlusPlus MCP Server',
            description: 'A powerful MCP server with dependency management tools',
            status: 'active',
            ownerId: 1,
        },
        {
            id: 2,
            name: 'Demo Angular App',
            description: 'Sample Angular application for testing',
            status: 'completed',
            ownerId: 2,
        },
        {
            id: 3,
            name: 'React Dashboard',
            description: 'Modern dashboard built with React',
            status: 'in-progress',
            ownerId: 1,
        },
    ],
    documentation: {
        'getting-started': `# Getting Started with NgPlusPlus

NgPlusPlus is a powerful MCP (Model Context Protocol) server that provides tools for dependency management and project automation.

## Installation

1. Clone the repository
2. Run \`npm install\`
3. Build the project with \`npm run build\`
4. Start the server

## Features

- Echo tools for text manipulation
- NCU (npm-check-updates) integration
- Dependency resolution utilities
- AI-enhanced text processing`,

        'api-reference': `# API Reference

## Tools

### Echo Tools
- \`echo\`: Basic text echoing
- \`multi_echo\`: Multiple text echoing
- \`echo_formatted\`: Text formatting options
- \`echo_ai_enhanced\`: AI-powered text enhancement

### Dependency Tools
- \`ncu_update\`: Update package dependencies
- \`dependency_resolver_update\`: Advanced dependency resolution

## Resources

### Demo Resources
- \`users\`: User management data
- \`projects\`: Project information
- \`documentation\`: API and usage documentation`,

        troubleshooting: `# Troubleshooting

## Common Issues

### OpenAI Configuration
If AI-enhanced features aren't working, ensure your OPENAI_API_KEY environment variable is set.

### Dependency Conflicts
Use the dependency resolver tools to automatically resolve version conflicts.

### Logging
Check the logs directory for detailed error information and debugging output.`,
    },
};

/**
 * Register demo resources with the MCP server
 */
export function registerDemoResources(server: McpServer) {
    const logger = getLogger().child('demo-resource');

    logger.info('Registering demo resources');

    // Register users resource
    server.registerResource(
        'demo-users',
        'demo://users',
        {
            title: 'Demo Users',
            description: 'Demo user data for testing MCP resources',
            mimeType: 'application/json',
        },
        async (uri) => {
            const requestId = Math.random().toString(36).substring(2, 9);
            logger.debug('Serving users resource', { requestId, uri: uri.href });

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(demoData.users, null, 2),
                    },
                ],
            };
        }
    );

    // Register projects resource
    server.registerResource(
        'demo-projects',
        'demo://projects',
        {
            title: 'Demo Projects',
            description: 'Demo project data for testing MCP resources',
            mimeType: 'application/json',
        },
        async (uri) => {
            const requestId = Math.random().toString(36).substring(2, 9);
            logger.debug('Serving projects resource', { requestId, uri: uri.href });

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(demoData.projects, null, 2),
                    },
                ],
            };
        }
    );

    // Register documentation resources
    Object.entries(demoData.documentation).forEach(([docName, content]) => {
        server.registerResource(
            `demo-docs-${docName}`,
            `demo://docs/${docName}`,
            {
                title: `Documentation: ${docName}`,
                description: `Demo documentation for ${docName}`,
                mimeType: 'text/markdown',
            },
            async (uri) => {
                const requestId = Math.random().toString(36).substring(2, 9);
                logger.debug('Serving documentation resource', { requestId, docName, uri: uri.href });

                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: 'text/markdown',
                            text: content,
                        },
                    ],
                };
            }
        );
    });

    logger.info('Demo resources registered successfully');
}
