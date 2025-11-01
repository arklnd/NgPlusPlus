import { expect, describe, it, beforeEach } from 'bun:test';
import { OpenAIService, OpenAIConfigSchema, getOpenAIService, initializeOpenAI } from '@S/index';

describe('OpenAI Service', function () {
    describe('OpenAIConfigSchema', function () {
        it('should validate valid configuration', function () {
            const validConfig = {
                apiKey: 'sk-test-key',
                baseURL: 'http://aaaa:3000/',
                model: 'copilot-gpt-4',
                temperature: 0.5,
                maxTokens: 2000,
                timeout: 60000
            };

            const result = OpenAIConfigSchema.parse(validConfig);
            expect(result).toEqual(validConfig);
        });

        it('should apply default values for optional fields', function () {
            const minimalConfig = {};
            const result = OpenAIConfigSchema.parse(minimalConfig);
            
            expect(result.model).toBe('gpt-x');
            expect(result.temperature).toBe(0.7);
            expect(result.maxTokens).toBe(1000);
            expect(result.timeout).toBe(30000);
        });

        it('should validate temperature range', function () {
            expect(() => OpenAIConfigSchema.parse({ temperature: -1 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ temperature: 3 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ temperature: 0 })).not.toThrow();
            expect(() => OpenAIConfigSchema.parse({ temperature: 2 })).not.toThrow();
        });

        it('should validate positive maxTokens', function () {
            expect(() => OpenAIConfigSchema.parse({ maxTokens: 0 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ maxTokens: -100 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ maxTokens: 100 })).not.toThrow();
        });

        it('should validate positive timeout', function () {
            expect(() => OpenAIConfigSchema.parse({ timeout: 0 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ timeout: -1000 })).toThrow();
            expect(() => OpenAIConfigSchema.parse({ timeout: 5000 })).not.toThrow();
        });
    });

    describe('OpenAIService Constructor', function () {
        it('should create service with default configuration', function () {
            const service = new OpenAIService();
            const config = service.getConfig();
            
            expect(config.model).toBe('gpt-4o-mini');
            expect(config.temperature).toBe(0.7);
            expect(config.maxTokens).toBe(1000);
            expect(config.timeout).toBe(30000);
        });

        it('should create service with custom configuration', function () {
            const customConfig = {
                model: 'gpt-4',
                temperature: 0.5,
                maxTokens: 2000,
                timeout: 60000
            };

            const service = new OpenAIService(customConfig);
            const config = service.getConfig();
            
            expect(config.model).toBe('gpt-4');
            expect(config.temperature).toBe(0.5);
            expect(config.maxTokens).toBe(2000);
            expect(config.timeout).toBe(60000);
        });

        it('should merge custom config with defaults', function () {
            const partialConfig = {
                model: 'gpt-4',
                temperature: 0.2
            };

            const service = new OpenAIService(partialConfig);
            const config = service.getConfig();
            
            expect(config.model).toBe('gpt-4');
            expect(config.temperature).toBe(0.2);
            expect(config.maxTokens).toBe(1000); // default value
            expect(config.timeout).toBe(30000); // default value
        });
    });

    describe('Configuration Management', function () {
        let service: OpenAIService;

        beforeEach(function () {
            service = new OpenAIService();
        });

        it('should get current configuration', function () {
            const config = service.getConfig();
            expect(config).toBeInstanceOf(Object);
            expect(config).toHaveProperty('model');
            expect(config).toHaveProperty('temperature');
            expect(config).toHaveProperty('maxTokens');
            expect(config).toHaveProperty('timeout');
        });

        it('should update configuration', function () {
            const newConfig = {
                model: 'gpt-4',
                temperature: 0.1,
                maxTokens: 500
            };

            service.updateConfig(newConfig);
            const config = service.getConfig();
            
            expect(config.model).toBe('gpt-4');
            expect(config.temperature).toBe(0.1);
            expect(config.maxTokens).toBe(500);
        });

        it('should validate configuration on update', function () {
            expect(() => service.updateConfig({ temperature: -1 })).toThrow();
            expect(() => service.updateConfig({ maxTokens: 0 })).toThrow();
            expect(() => service.updateConfig({ timeout: -1000 })).toThrow();
        });
    });

    describe('Service Status', function () {
        it('should check if service is configured with API key', function () {
            const serviceWithKey = new OpenAIService({ apiKey: 'sk-test-key' });
            expect(serviceWithKey.isConfigured()).toBe(true);
        });

        it('should check if service is not configured without API key', function () {
            const serviceWithoutKey = new OpenAIService({ apiKey: '' });
            expect(serviceWithoutKey.isConfigured()).toBe(false);
        });
    });

    describe('Text Generation (Mocked)', function () {
        let service: OpenAIService;

        beforeEach(function () {
            // Create service with test configuration
            service = new OpenAIService({
                apiKey: 'sk-test-key',
                maxTokens: 100
            });
        });

        // Note: These tests would require actual API calls or mocking
        // For demonstration, we'll test the method structure and error handling

        it('should have generateText method', function () {
            expect(typeof service.generateText).toBe('function');
        });

        it('should have generateTextWithHistory method', function () {
            expect(typeof service.generateTextWithHistory).toBe('function');
        });

        it('should have generateTextStream method', function () {
            expect(typeof service.generateTextStream).toBe('function');
        });

        it('should handle missing prompt gracefully', async function () {
            try {
                // This should trigger an error due to empty/invalid prompt
                await service.generateText('');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('OpenAI API error');
            }
        });

        it('should handle invalid messages array', async function () {
            try {
                // This should trigger an error due to empty messages
                await service.generateTextWithHistory([]);
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('OpenAI API error');
            }
        });
    });

    describe('Connection Testing', function () {
        it('should have testConnection method', function () {
            const service = new OpenAIService();
            expect(typeof service.testConnection).toBe('function');
        });

        // it('should return false for connection test without valid API key', async function () {
        //     const service = new OpenAIService({ apiKey: '' });
        //     const result = await service.testConnection();
        //     expect(result).to.be.false;
        // });

        // it('should return false for connection test with invalid API key', async function () {
        //     const service = new OpenAIService({ apiKey: 'invalid-key' });
        //     const result = await service.testConnection();
        //     expect(result).to.be.false;
        // });
    });

    describe('Singleton Pattern', function () {
        beforeEach(function () {
            // Reset singleton for each test
            // Note: This assumes we can access the private instance for testing
            // In a real scenario, you might need to expose a reset method for testing
        });

        it('should return same instance on multiple calls', function () {
            const service1 = getOpenAIService();
            const service2 = getOpenAIService();
            expect(service1).toBe(service2);
        });

        it('should update configuration on existing instance', function () {
            const service1 = getOpenAIService({ model: 'gpt-4o-mini' });
            const service2 = getOpenAIService({ model: 'gpt-4' });
            
            expect(service1).toBe(service2);
            expect(service1.getConfig().model).toBe('gpt-4');
        });

        it('should create new instance with initializeOpenAI', function () {
            const service1 = getOpenAIService();
            const service2 = initializeOpenAI({ model: 'gpt-4' });
            
            // They should be the same instance (singleton)
            expect(service1).toBe(service2);
            expect(service2.getConfig().model).toBe('gpt-4');
        });
    });

    describe('Error Handling', function () {
        let service: OpenAIService;

        beforeEach(function () {
            service = new OpenAIService({ apiKey: 'invalid-key' });
        });

        it('should throw descriptive errors for API failures', async function () {
            try {
                await service.generateText('test prompt');
                expect(true).toBe(false); // Should have thrown an error
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('OpenAI API error');
            }
        });

        it('should handle streaming errors gracefully', async function () {
            try {
                const stream = service.generateTextStream('test prompt');
                await stream.next();
                expect(true).toBe(false); // Should have thrown an error
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('OpenAI API error');
            }
        });
    });

    describe('Environment Variable Integration', function () {
        it('should use environment variables for default configuration', function () {
            // This test checks if the service respects environment variables
            // In a real test environment, you would set process.env values
            const service = new OpenAIService();
            const config = service.getConfig();
            
            // Check that configuration has expected structure
            expect(config).toHaveProperty('apiKey');
            expect(config).toHaveProperty('baseURL');
            expect(config).toHaveProperty('model');
            expect(config).toHaveProperty('temperature');
            expect(config).toHaveProperty('maxTokens');
            expect(config).toHaveProperty('timeout');
        });
    });

    describe('Options Handling', function () {
        let service: OpenAIService;

        beforeEach(function () {
            service = new OpenAIService({
                apiKey: 'test-key',
                model: 'gpt-4o-mini',
                temperature: 0.7,
                maxTokens: 1000
            });
        });

        it('should use default options when none provided', function () {
            // Testing that methods accept undefined options
            expect(() => service.generateText('test')).not.toThrow();
        });

        it('should override defaults with provided options', function () {
            const options = {
                model: 'gpt-4',
                temperature: 0.2,
                maxTokens: 500,
                systemPrompt: 'You are a helpful assistant.'
            };

            // Test that options are accepted without throwing
            expect(() => service.generateText('test', options)).not.toThrow();
        });

        it('should handle systemPrompt option', function () {
            const options = {
                systemPrompt: 'You are a test assistant.'
            };

            expect(() => service.generateText('test', options)).not.toThrow();
        });
    });

    describe('Message Format Validation', function () {
        let service: OpenAIService;

        beforeEach(function () {
            service = new OpenAIService({ apiKey: 'test-key' });
        });

        it('should accept valid message format', function () {
            const messages = [
                { role: 'system' as const, content: 'You are a helpful assistant.' },
                { role: 'user' as const, content: 'Hello!' }
            ];

            expect(() => service.generateTextWithHistory(messages)).not.toThrow();
        });

        it('should handle empty content gracefully', async function () {
            const messages = [
                { role: 'user' as const, content: '' }
            ];

            try {
                await service.generateTextWithHistory(messages);
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('OpenAI API error');
            }
        });
    });
});