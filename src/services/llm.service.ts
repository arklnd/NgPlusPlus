import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { getLogger, ChildLogger } from '@U/logger.utils';
import { invokeVscodeLM } from '@S/vscode-lm.service';

/**
 * LLM Service - Unified interface supporting two providers:
 * 
 * 1. VS Code Language Model API (default) - uses GitHub Copilot or other VS Code LM extensions
 * 2. OpenAI-compatible endpoints - works with OpenAI, Ollama, Azure, LM Studio, etc.
 * 
 * The active provider is determined by the VS Code setting `ngplusplus.llmProvider`.
 */

let llmInstance: ChatOpenAI | null = null;
let logger: ChildLogger;
let activeProvider: 'vscode' | 'openai' = 'vscode';

export interface LLMConfig {
    provider?: 'vscode' | 'openai';
    apiKey?: string;
    baseURL?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
}

const DEFAULT_OPENAI_CONFIG = {
    apiKey: 'ollama-dummy-key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4',
    temperature: 0.3,
    maxTokens: 2000,
    timeout: 60000,
};

let currentConfig = { ...DEFAULT_OPENAI_CONFIG };

/**
 * Initialize the LLM service with configuration (called from extension.ts)
 */
export function initializeLLM(config: LLMConfig): void {
    if (!logger) {
        logger = getLogger().child('LLMService');
    }

    activeProvider = config.provider || 'vscode';

    if (activeProvider === 'openai') {
        currentConfig = {
            apiKey: config.apiKey || DEFAULT_OPENAI_CONFIG.apiKey,
            baseURL: config.baseURL || DEFAULT_OPENAI_CONFIG.baseURL,
            model: config.model || DEFAULT_OPENAI_CONFIG.model,
            temperature: config.temperature ?? DEFAULT_OPENAI_CONFIG.temperature,
            maxTokens: config.maxTokens ?? DEFAULT_OPENAI_CONFIG.maxTokens,
            timeout: config.timeout ?? DEFAULT_OPENAI_CONFIG.timeout,
        };

        logger.info('Initializing OpenAI-compatible LLM', {
            baseURL: currentConfig.baseURL,
            model: currentConfig.model,
            temperature: currentConfig.temperature,
        });

        llmInstance = new ChatOpenAI({
            openAIApiKey: currentConfig.apiKey,
            configuration: { baseURL: currentConfig.baseURL },
            modelName: currentConfig.model,
            temperature: currentConfig.temperature,
            maxTokens: currentConfig.maxTokens,
            timeout: currentConfig.timeout,
        });
    } else {
        logger.info('Using VS Code Language Model API');
        llmInstance = null;
    }
}

/**
 * Get or create the ChatOpenAI instance (only for OpenAI provider)
 */
export function getLLM(config?: Partial<LLMConfig>): ChatOpenAI {
    if (!logger) {
        logger = getLogger().child('LLMService');
    }

    if (!llmInstance || config) {
        const mergedConfig = { ...currentConfig, ...config };

        llmInstance = new ChatOpenAI({
            openAIApiKey: mergedConfig.apiKey,
            configuration: { baseURL: mergedConfig.baseURL },
            modelName: mergedConfig.model,
            temperature: mergedConfig.temperature,
            maxTokens: mergedConfig.maxTokens,
            timeout: mergedConfig.timeout,
        });
    }

    return llmInstance;
}

/**
 * Get the currently active provider
 */
export function getActiveProvider(): 'vscode' | 'openai' {
    return activeProvider;
}

/**
 * Helper to invoke the LLM with a simple prompt (system + user message).
 * Routes to the appropriate provider based on configuration.
 */
export async function invokeWithPrompt(
    prompt: string,
    options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
    if (activeProvider === 'vscode') {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        if (options?.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        return invokeVscodeLM(messages);
    }

    // OpenAI provider
    const llm = getLLM();
    const messages: BaseMessage[] = [];

    if (options?.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
    }
    messages.push(new HumanMessage(prompt));

    const boundLlm = (options?.temperature !== undefined || options?.maxTokens !== undefined)
        ? new ChatOpenAI({
            openAIApiKey: currentConfig.apiKey,
            configuration: { baseURL: currentConfig.baseURL },
            modelName: currentConfig.model,
            temperature: options?.temperature ?? currentConfig.temperature,
            maxTokens: options?.maxTokens ?? currentConfig.maxTokens,
            timeout: currentConfig.timeout,
        })
        : llm;

    const response = await boundLlm.invoke(messages);

    return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
}

/**
 * Helper to invoke the LLM with a full message history.
 * Routes to the appropriate provider based on configuration.
 */
export async function invokeWithHistory(
    messages: BaseMessage[],
    options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
    if (activeProvider === 'vscode') {
        // Convert BaseMessage[] to simple format for VS Code LM
        const simpleMessages = messages.map((m) => {
            if (m instanceof SystemMessage || m._getType() === 'system') {
                return { role: 'system' as const, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
            }
            if (m instanceof AIMessage || m._getType() === 'ai') {
                return { role: 'assistant' as const, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
            }
            return { role: 'user' as const, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
        });
        return invokeVscodeLM(simpleMessages);
    }

    // OpenAI provider
    const llm = getLLM();

    const boundLlm = (options?.temperature !== undefined || options?.maxTokens !== undefined)
        ? new ChatOpenAI({
            openAIApiKey: currentConfig.apiKey,
            configuration: { baseURL: currentConfig.baseURL },
            modelName: currentConfig.model,
            temperature: options?.temperature ?? currentConfig.temperature,
            maxTokens: options?.maxTokens ?? currentConfig.maxTokens,
            timeout: currentConfig.timeout,
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
