import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getLogger, ChildLogger } from '@U/logger.utils';
import { getCallerDetails } from '@U/index';
dotenv.config();
// Configuration schema for OpenAI
export const OpenAIConfigSchema = z.object({
    apiKey: z.string().optional(),
    baseURL: z.string().optional(),
    model: z.string().default('gpt-default'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
    timeout: z.number().positive().default(30000), // 30 seconds
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

// Default configuration
const DEFAULT_CONFIG: Required<OpenAIConfig> = {
    apiKey: process.env.OPENAI_API_KEY || '---',
    baseURL: process.env.OPENAI_BASE_URL || 'https://x-api.openai.com/v1/',
    model: process.env.OPENAI_MODEL || 'gpt-x',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
};

/**
 * Centralized OpenAI service for consistent LLM usage across tools and resources
 */
export class OpenAIService {
    private client: OpenAI;
    private config: Required<OpenAIConfig>;
    private logger: ChildLogger;

    constructor(config?: Partial<OpenAIConfig>) {
        const caller = getCallerDetails();
        this.logger = getLogger().child(`${'OpenAIService'} ${caller?.fileName}:${caller?.lineNumber}`);
        this.logger.debug('Initializing OpenAI service', { providedConfig: config });
        
        // Merge provided config with defaults
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger.debug('Merged configuration with defaults');

        // Validate configuration
        try {
            const validatedConfig = OpenAIConfigSchema.parse(this.config);
            this.config = { ...DEFAULT_CONFIG, ...validatedConfig };
            this.logger.debug('Configuration validated successfully');
        } catch (error) {
            this.logger.error('Configuration validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            throw error;
        }

        // Initialize OpenAI client
        try {
            this.client = new OpenAI({
                apiKey: this.config.apiKey,
                baseURL: this.config.baseURL,
                timeout: this.config.timeout,
            });
            this.logger.info('OpenAI client initialized successfully', {
                baseURL: this.config.baseURL,
                model: this.config.model,
                timeout: this.config.timeout,
                hasApiKey: !!this.config.apiKey
            });
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI client', { error: error instanceof Error ? error.message : 'Unknown error' });
            throw error;
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): Required<OpenAIConfig> {
        this.logger.debug('Configuration requested');
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<OpenAIConfig>): void {
        this.logger.debug('Updating configuration', { newConfig });
        
        try {
            const validatedConfig = OpenAIConfigSchema.parse({ ...this.config, ...newConfig });
            this.config = { ...this.config, ...validatedConfig };
            this.logger.debug('Configuration updated successfully');

            // Recreate client if API-related settings changed
            if (newConfig.apiKey || newConfig.baseURL || newConfig.timeout) {
                this.logger.debug('Recreating OpenAI client due to API-related config changes');
                this.client = new OpenAI({
                    apiKey: this.config.apiKey,
                    baseURL: this.config.baseURL,
                    timeout: this.config.timeout,
                });
                this.logger.info('OpenAI client recreated successfully');
            }
        } catch (error) {
            this.logger.error('Failed to update configuration', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                newConfig 
            });
            throw error;
        }
    }

    /**
     * Generate text completion using chat completion API
     */
    async generateText(
        prompt: string,
        options?: {
            systemPrompt?: string;
            model?: string;
            temperature?: number;
            maxTokens?: number;
        }
    ): Promise<string> {
        const requestId = Math.random().toString(36).substring(7);
        this.logger.info('Starting text generation', {
            requestId,
            promptLength: prompt.length,
            hasSystemPrompt: !!options?.systemPrompt,
            model: options?.model || this.config.model,
            temperature: options?.temperature ?? this.config.temperature,
            maxTokens: options?.maxTokens ?? this.config.maxTokens
        });

        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

            // Add system message if provided
            if (options?.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt,
                });
                this.logger.debug('Added system prompt to messages', { requestId });
            }

            // Add user message
            messages.push({
                role: 'user',
                content: prompt,
            });

            this.logger.debug('Sending request to OpenAI', { requestId, messageCount: messages.length });
            const startTime = Date.now();

            const response = await this.client.chat.completions.create({
                model: options?.model || this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            });

            const endTime = Date.now();
            const responseContent = response.choices[0]?.message?.content || '';
            
            this.logger.info('Text generation completed successfully', {
                requestId,
                responseLength: responseContent.length,
                duration: endTime - startTime,
                usage: response.usage,
                model: response.model
            });

            return responseContent;
        } catch (error) {
            this.logger.error('Text generation failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                promptLength: prompt.length
            });
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate text with conversation history
     */
    async generateTextWithHistory(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        options?: {
            model?: string;
            temperature?: number;
            maxTokens?: number;
        }
    ): Promise<string> {
        const requestId = Math.random().toString(36).substring(7);
        this.logger.info('Starting text generation with history', {
            requestId,
            messageCount: messages.length,
            model: options?.model || this.config.model,
            temperature: options?.temperature ?? this.config.temperature,
            maxTokens: options?.maxTokens ?? this.config.maxTokens
        });

        try {
            this.logger.debug('Sending request to OpenAI with conversation history', { 
                requestId, 
                messageTypes: messages.map(m => m.role) 
            });
            const startTime = Date.now();

            const response = await this.client.chat.completions.create({
                model: options?.model || this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            });

            const endTime = Date.now();
            const responseContent = response.choices[0]?.message?.content || '';
            
            this.logger.info('Text generation with history completed successfully', {
                requestId,
                responseLength: responseContent.length,
                duration: endTime - startTime,
                usage: response.usage,
                model: response.model
            });

            return responseContent;
        } catch (error) {
            this.logger.error('Text generation with history failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                messageCount: messages.length
            });
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate streaming text completion
     */
    async *generateTextStream(
        prompt: string,
        options?: {
            systemPrompt?: string;
            model?: string;
            temperature?: number;
            maxTokens?: number;
        }
    ): AsyncGenerator<string, void, unknown> {
        const requestId = Math.random().toString(36).substring(7);
        this.logger.info('Starting streaming text generation', {
            requestId,
            promptLength: prompt.length,
            hasSystemPrompt: !!options?.systemPrompt,
            model: options?.model || this.config.model,
            temperature: options?.temperature ?? this.config.temperature,
            maxTokens: options?.maxTokens ?? this.config.maxTokens
        });

        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

            if (options?.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt,
                });
                this.logger.debug('Added system prompt to streaming messages', { requestId });
            }

            messages.push({
                role: 'user',
                content: prompt,
            });

            this.logger.debug('Starting streaming request to OpenAI', { requestId, messageCount: messages.length });
            const startTime = Date.now();
            let totalChunks = 0;
            let totalContent = '';

            const stream = await this.client.chat.completions.create({
                model: options?.model || this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    totalChunks++;
                    totalContent += content;
                    yield content;
                }
            }

            const endTime = Date.now();
            this.logger.info('Streaming text generation completed successfully', {
                requestId,
                totalChunks,
                totalContentLength: totalContent.length,
                duration: endTime - startTime
            });
        } catch (error) {
            this.logger.error('Streaming text generation failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                promptLength: prompt.length
            });
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if the service is properly configured
     */
    isConfigured(): boolean {
        const configured = !!this.config.apiKey;
        this.logger.debug('Configuration check', { isConfigured: configured });
        return configured;
    }

    /**
     * Test the connection to OpenAI
     */
    async testConnection(): Promise<boolean> {
        this.logger.info('Testing OpenAI connection');
        try {
            const startTime = Date.now();
            await this.generateText('Hello', { maxTokens: 10 });
            const duration = Date.now() - startTime;
            this.logger.info('OpenAI connection test successful', { duration });
            return true;
        } catch (error) {
            this.logger.error('OpenAI connection test failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
}

// Singleton instance
let openAIServiceInstance: OpenAIService | null = null;

/**
 * Get the singleton OpenAI service instance
 */
export function getOpenAIService(config?: Partial<OpenAIConfig>): OpenAIService {
    const caller = getCallerDetails();
    const logger = getLogger().child(`${'OpenAIService:Singleton'} ${caller?.fileName}:${caller?.lineNumber}`);
    
    if (!openAIServiceInstance) {
        logger.debug('Creating new OpenAI service instance');
        openAIServiceInstance = new OpenAIService(config);
    } else if (config) {
        logger.debug('Updating existing OpenAI service instance configuration');
        openAIServiceInstance.updateConfig(config);
    } else {
        logger.debug('Returning existing OpenAI service instance');
    }
    return openAIServiceInstance;
}

/**
 * Initialize OpenAI service with configuration
 */
export function initializeOpenAI(config?: Partial<OpenAIConfig>): OpenAIService {
    const caller = getCallerDetails();
    const logger = getLogger().child(`${'OpenAIService:Initialize'} ${caller?.fileName}:${caller?.lineNumber}`);
    logger.info('Initializing new OpenAI service instance', { hasConfig: !!config });
    openAIServiceInstance = new OpenAIService(config);
    return openAIServiceInstance;
}
