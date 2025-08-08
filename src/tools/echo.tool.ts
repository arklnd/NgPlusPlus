import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getOpenAIService } from '../services/index.js';

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
                            txt.substring(1).toLowerCase()
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

    // Register AI-enhanced echo tool
    server.registerTool(
        'echo_ai_enhanced',
        {
            title: 'AI Enhanced Echo Tool',
            description: 'Echo text with AI-powered enhancements like grammar correction, style improvement, or translation',
            inputSchema: {
                text: z.string().describe('The text to enhance and echo back'),
                enhancement: z
                    .enum([
                        'grammar_fix',
                        'style_improve',
                        'make_formal',
                        'make_casual',
                        'summarize',
                        'expand',
                        'translate_to_spanish',
                        'translate_to_french',
                        'none',
                    ])
                    .default('none')
                    .describe('Type of AI enhancement to apply'),
                customPrompt: z
                    .string()
                    .optional()
                    .describe('Custom instruction for AI enhancement (overrides enhancement type)'),
                includeOriginal: z
                    .boolean()
                    .default(false)
                    .describe('Whether to include the original text alongside the enhanced version'),
            },
        },
        async ({ text, enhancement, customPrompt, includeOriginal }) => {
            try {
                const openAI = getOpenAIService();
                
                if (!openAI.isConfigured()) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Error: OpenAI is not configured. Please set OPENAI_API_KEY environment variable.',
                            },
                        ],
                    };
                }

                let enhancedText = text;
                
                if (enhancement !== 'none' || customPrompt) {
                    let systemPrompt = 'You are a helpful text enhancement assistant.';
                    let userPrompt = '';

                    if (customPrompt) {
                        userPrompt = `${customPrompt}\n\nText to process: "${text}"`;
                    } else {
                        switch (enhancement) {
                            case 'grammar_fix':
                                userPrompt = `Fix any grammar, spelling, and punctuation errors in the following text. Return only the corrected text:\n\n"${text}"`;
                                break;
                            case 'style_improve':
                                userPrompt = `Improve the writing style and clarity of the following text while maintaining its meaning. Return only the improved text:\n\n"${text}"`;
                                break;
                            case 'make_formal':
                                userPrompt = `Rewrite the following text in a formal, professional tone. Return only the rewritten text:\n\n"${text}"`;
                                break;
                            case 'make_casual':
                                userPrompt = `Rewrite the following text in a casual, friendly tone. Return only the rewritten text:\n\n"${text}"`;
                                break;
                            case 'summarize':
                                userPrompt = `Provide a concise summary of the following text. Return only the summary:\n\n"${text}"`;
                                break;
                            case 'expand':
                                userPrompt = `Expand and elaborate on the following text with more details and context. Return only the expanded text:\n\n"${text}"`;
                                break;
                            case 'translate_to_spanish':
                                userPrompt = `Translate the following text to Spanish. Return only the translation:\n\n"${text}"`;
                                break;
                            case 'translate_to_french':
                                userPrompt = `Translate the following text to French. Return only the translation:\n\n"${text}"`;
                                break;
                            default:
                                userPrompt = text;
                        }
                    }

                    enhancedText = await openAI.generateText(userPrompt, {
                        systemPrompt,
                        maxTokens: 2000,
                        temperature: 0.3, // Lower temperature for more consistent results
                    });
                }

                let result = '';
                if (includeOriginal && enhancement !== 'none') {
                    result = `Original: ${text}\n\nEnhanced (${enhancement}): ${enhancedText}`;
                } else {
                    result = enhancedText;
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error enhancing text: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                };
            }
        }
    );
}
