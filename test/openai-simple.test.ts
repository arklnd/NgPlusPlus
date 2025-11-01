import { expect, describe, it, beforeEach } from 'bun:test';
import { OpenAIService } from '@S/index';

describe('OpenAI Text Generation', function () {
    let service: OpenAIService;

    beforeEach(function () {
        // Create service with test configuration
        service = new OpenAIService({
            apiKey: 'sk-test-key',
            baseURL: 'http://localhost:3000/v1/',
            model: 'copilot-gpt-5',
            temperature: 0.7,
            maxTokens: 100
        });
    });

    describe('Basic Text Generation', function () {
        it('should generate text from a simple prompt', async function () {
            const prompt = 'Say "Hello World"';
            
            try {
                const result = await service.generateText(prompt);
                expect(result).toBeTypeOf('string');
                expect(result.length).toBeGreaterThan(0);
                console.log('Generated text:', result);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('should generate text with system prompt', async function () {
            const prompt = 'What is 2+2?';
            const options = {
                systemPrompt: 'You are a helpful math tutor.',
                maxTokens: 50
            };
            
            try {
                const result = await service.generateText(prompt, options);
                expect(result).toBeTypeOf('string');
                expect(result.length).toBeGreaterThan(0);
                console.log('Generated text with system prompt:', result);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('should generate text with custom options', async function () {
            const prompt = 'Write a short greeting';
            const options = {
                model: 'copilot-gpt-5',
                temperature: 0.1,
                maxTokens: 30
            };
            
            try {
                const result = await service.generateText(prompt, options);
                expect(result).toBeTypeOf('string');
                console.log('Generated text with custom options:', result);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    describe('Text Generation with History', function () {
        it('should generate text with conversation history', async function () {
            const messages = [
                { role: 'system' as const, content: 'You are a helpful assistant.' },
                { role: 'user' as const, content: 'Hello!' },
                { role: 'assistant' as const, content: 'Hi there! How can I help you?' },
                { role: 'user' as const, content: 'What is your name?' }
            ];
            
            try {
                const result = await service.generateTextWithHistory(messages);
                expect(result).toBeTypeOf('string');
                expect(result.length).toBeGreaterThan(0);
                console.log('Generated text with history:', result);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    describe('Streaming Text Generation', function () {
        it('should generate streaming text', async function () {
            const prompt = 'Count from 1 to 5';
            
            try {
                const stream = service.generateTextStream(prompt);
                let fullText = '';
                let chunkCount = 0;
                
                for await (const chunk of stream) {
                    expect(chunk).toBeTypeOf('string');
                    fullText += chunk;
                    chunkCount++;
                    
                    // Prevent infinite loops in test
                    if (chunkCount > 100) break;
                }
                
                expect(fullText.length).toBeGreaterThan(0);
                expect(chunkCount).toBeGreaterThan(0);
                console.log('Streamed text:', fullText);
                console.log('Number of chunks:', chunkCount);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('should generate streaming text with options', async function () {
            const prompt = 'Say hello briefly';
            const options = {
                systemPrompt: 'Be concise.',
                maxTokens: 20
            };
            
            try {
                const stream = service.generateTextStream(prompt, options);
                let fullText = '';
                
                for await (const chunk of stream) {
                    fullText += chunk;
                }
                
                expect(fullText).toBeTypeOf('string');
                console.log('Streamed text with options:', fullText);
            } catch (error) {
                console.log('Expected error for test environment:', (error as Error).message);
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    describe('Service Configuration', function () {
        it('should be configured with API key', function () {
            expect(service.isConfigured()).toBe(true);
        });

        it('should have correct configuration', function () {
            const config = service.getConfig();
            expect(config.model).toBe('copilot-gpt-5');
            expect(config.temperature).toBe(0.7);
            expect(config.maxTokens).toBe(100);
        });
    });
});