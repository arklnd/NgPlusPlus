import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import dotenv from 'dotenv';
import { getLogger, ChildLogger } from '@U/logger.utils';

dotenv.config();

/**
 * LLM Service - replaces the old OpenAI service with LangChain's ChatOpenAI.
 * Supports OpenAI-compatible endpoints (OpenAI, Ollama, Azure, etc.)
 */

let llmInstance: ChatOpenAI | null = null;
let logger: ChildLogger;

export interface LLMConfig {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
}

const DEFAULT_CONFIG: Required<LLMConfig> = {
    apiKey: process.env.OPENAI_API_KEY || 'ollama-dummy-key',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '60000'),
};

/**
 * Get or create the singleton ChatOpenAI instance
 */
export function getLLM(config?: Partial<LLMConfig>): ChatOpenAI {
    if (!logger) {
        logger = getLogger().child('LLMService');
    }

    if (!llmInstance || config) {
        const mergedConfig = { ...DEFAULT_CONFIG, ...config };
        logger.info('Initializing ChatOpenAI LLM', {
            baseURL: mergedConfig.baseURL,
            model: mergedConfig.model,
            temperature: mergedConfig.temperature,
        });

        llmInstance = new ChatOpenAI({
            openAIApiKey: mergedConfig.apiKey,
            configuration: {
                baseURL: mergedConfig.baseURL,
            },
            modelName: mergedConfig.model,
            temperature: mergedConfig.temperature,
            maxTokens: mergedConfig.maxTokens,
            timeout: mergedConfig.timeout,
        });
    }

    return llmInstance;
}

/**
 * Helper to invoke the LLM with a simple prompt (system + user message)
 */
export async function invokeWithPrompt(
    prompt: string,
    options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
    const llm = getLLM();
    const messages: BaseMessage[] = [];

    if (options?.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
    }
    messages.push(new HumanMessage(prompt));

    // Create a bound model with overridden settings if needed
    const boundLlm = (options?.temperature !== undefined || options?.maxTokens !== undefined)
        ? new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY || DEFAULT_CONFIG.apiKey,
            configuration: { baseURL: process.env.OPENAI_BASE_URL || DEFAULT_CONFIG.baseURL },
            modelName: process.env.OPENAI_MODEL || DEFAULT_CONFIG.model,
            temperature: options?.temperature ?? DEFAULT_CONFIG.temperature,
            maxTokens: options?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
            timeout: DEFAULT_CONFIG.timeout,
        })
        : llm;

    const response = await boundLlm.invoke(messages);

    return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
}

/**
 * Helper to invoke the LLM with a full message history
 */
export async function invokeWithHistory(
    messages: BaseMessage[],
    options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
    const llm = getLLM();

    // Create a bound model with overridden settings if needed
    const boundLlm = (options?.temperature !== undefined || options?.maxTokens !== undefined)
        ? new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY || DEFAULT_CONFIG.apiKey,
            configuration: { baseURL: process.env.OPENAI_BASE_URL || DEFAULT_CONFIG.baseURL },
            modelName: process.env.OPENAI_MODEL || DEFAULT_CONFIG.model,
            temperature: options?.temperature ?? DEFAULT_CONFIG.temperature,
            maxTokens: options?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
            timeout: DEFAULT_CONFIG.timeout,
        })
        : llm;

    const response = await boundLlm.invoke(messages);

    return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
}

/**
 * Convert role/content pairs to LangChain BaseMessage array
 */
export function toMessages(
    msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): BaseMessage[] {
    return msgs.map((m) => {
        switch (m.role) {
            case 'system':
                return new SystemMessage(m.content);
            case 'user':
                return new HumanMessage(m.content);
            case 'assistant':
                return new AIMessage(m.content);
        }
    });
}
