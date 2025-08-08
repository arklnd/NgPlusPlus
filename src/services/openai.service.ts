import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
// Configuration schema for OpenAI
export const OpenAIConfigSchema = z.object({
    apiKey: z.string().optional(),
    baseURL: z.string().optional(),
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
    timeout: z.number().positive().default(30000), // 30 seconds
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

// Default configuration
const DEFAULT_CONFIG: Required<OpenAIConfig> = {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

    constructor(config?: Partial<OpenAIConfig>) {
        // Merge provided config with defaults
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Validate configuration
        const validatedConfig = OpenAIConfigSchema.parse(this.config);
        this.config = { ...DEFAULT_CONFIG, ...validatedConfig };

        // Initialize OpenAI client
        this.client = new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
        });
    }

    /**
     * Get current configuration
     */
    getConfig(): Required<OpenAIConfig> {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<OpenAIConfig>): void {
        const validatedConfig = OpenAIConfigSchema.parse({ ...this.config, ...newConfig });
        this.config = { ...this.config, ...validatedConfig };
        
        // Recreate client if API-related settings changed
        if (newConfig.apiKey || newConfig.baseURL || newConfig.timeout) {
            this.client = new OpenAI({
                apiKey: this.config.apiKey,
                baseURL: this.config.baseURL,
                timeout: this.config.timeout,
            });
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
        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            
            // Add system message if provided
            if (options?.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt,
                });
            }
            
            // Add user message
            messages.push({
                role: 'user',
                content: prompt,
            });

            const response = await this.client.chat.completions.create({
                model: options?.model || this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
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
        try {
            const response = await this.client.chat.completions.create({
                model: options?.model || this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
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
        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
            
            if (options?.systemPrompt) {
                messages.push({
                    role: 'system',
                    content: options.systemPrompt,
                });
            }
            
            messages.push({
                role: 'user',
                content: prompt,
            });

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
                    yield content;
                }
            }
        } catch (error) {
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if the service is properly configured
     */
    isConfigured(): boolean {
        return !!this.config.apiKey;
    }

    /**
     * Test the connection to OpenAI
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.generateText('Hello', { maxTokens: 10 });
            return true;
        } catch {
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
    if (!openAIServiceInstance) {
        openAIServiceInstance = new OpenAIService(config);
    } else if (config) {
        openAIServiceInstance.updateConfig(config);
    }
    return openAIServiceInstance;
}

/**
 * Initialize OpenAI service with configuration
 */
export function initializeOpenAI(config?: Partial<OpenAIConfig>): OpenAIService {
    openAIServiceInstance = new OpenAIService(config);
    return openAIServiceInstance;
}
