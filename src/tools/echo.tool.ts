import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register echo tools with the MCP server
 */
export function registerEchoTools(server: McpServer) {
    // Register echo tool
    server.registerTool(
        'echo',
        {
            title: 'Echo Tool',
            description: 'Echo back the provided text string',
            inputSchema: {
                text: z.string().describe('The text to echo back'),
                repeat: z
                    .number()
                    .min(1)
                    .max(10)
                    .default(1)
                    .describe(
                        'Number of times to repeat the text (default: 1)'
                    ),
                prefix: z
                    .string()
                    .default('')
                    .describe('Optional prefix to add before the echoed text'),
                suffix: z
                    .string()
                    .default('')
                    .describe('Optional suffix to add after the echoed text'),
            },
        },
        async ({ text, repeat, prefix, suffix }) => {
            // Build the echoed result
            const echoedTexts: string[] = [];
            for (let i = 0; i < repeat; i++) {
                echoedTexts.push(`${prefix}${text}${suffix}`);
            }

            const result = echoedTexts.join('\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: result,
                    },
                ],
            };
        }
    );

    // Register multi-echo tool
    server.registerTool(
        'multi_echo',
        {
            title: 'Multi Echo Tool',
            description: 'Echo back multiple text strings',
            inputSchema: {
                texts: z
                    .array(z.string())
                    .min(1)
                    .max(20)
                    .describe('Array of texts to echo back'),
                separator: z
                    .string()
                    .default('\n')
                    .describe(
                        'Separator between echoed texts (default: newline)'
                    ),
                numbered: z
                    .boolean()
                    .default(false)
                    .describe('Whether to number the echoed texts'),
            },
        },
        async ({ texts, separator, numbered }) => {
            // Build the result
            const echoedTexts = texts.map((text, index) => {
                return numbered ? `${index + 1}. ${text}` : text;
            });

            const result = echoedTexts.join(separator);

            return {
                content: [
                    {
                        type: 'text',
                        text: result,
                    },
                ],
            };
        }
    );

    // Register echo formatted tool
    server.registerTool(
        'echo_formatted',
        {
            title: 'Echo Formatted Tool',
            description: 'Echo text with various formatting options',
            inputSchema: {
                text: z.string().describe('The text to echo back'),
                format: z
                    .enum([
                        'uppercase',
                        'lowercase',
                        'title',
                        'reverse',
                        'none',
                    ])
                    .default('none')
                    .describe('Text formatting option'),
                wrap: z
                    .object({
                        width: z
                            .number()
                            .min(10)
                            .max(200)
                            .describe('Text wrap width in characters'),
                        indent: z
                            .string()
                            .default('')
                            .describe('Indentation string for wrapped lines'),
                    })
                    .optional()
                    .describe('Text wrapping options'),
            },
        },
        async ({ text, format, wrap }) => {
            let formattedText = text;

            // Apply formatting
            switch (format) {
                case 'uppercase':
                    formattedText = text.toUpperCase();
                    break;
                case 'lowercase':
                    formattedText = text.toLowerCase();
                    break;
                case 'title':
                    formattedText = text.replace(
                        /\w\S*/g,
                        (txt) =>
                            txt.charAt(0).toUpperCase() +
                            txt.substr(1).toLowerCase()
                    );
                    break;
                case 'reverse':
                    formattedText = text.split('').reverse().join('');
                    break;
                case 'none':
                default:
                    formattedText = text;
                    break;
            }

            // Apply wrapping if specified
            if (wrap && wrap.width) {
                const lines: string[] = [];
                const words = formattedText.split(' ');
                let currentLine = '';
                const indent = wrap.indent || '';

                for (const word of words) {
                    if ((currentLine + word).length <= wrap.width) {
                        currentLine += (currentLine ? ' ' : '') + word;
                    } else {
                        if (currentLine) {
                            lines.push(indent + currentLine);
                        }
                        currentLine = word;
                    }
                }

                if (currentLine) {
                    lines.push(indent + currentLine);
                }

                formattedText = lines.join('\n');
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: formattedText,
                    },
                ],
            };
        }
    );
}
