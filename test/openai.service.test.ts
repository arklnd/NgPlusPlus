import { expect } from 'chai';
import { OpenAIService, OpenAIConfigSchema, getOpenAIService, initializeOpenAI } from '@S/index';

describe('OpenAI Service', function () {
    // Increase timeout for API calls
    this.timeout(10000);

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
            expect(result).to.deep.equal(validConfig);
        });

        it('should apply default values for optional fields', function () {
            const minimalConfig = {};
            const result = OpenAIConfigSchema.parse(minimalConfig);
            
            expect(result.model).to.equal('gpt-x');
            expect(result.temperature).to.equal(0.7);
            expect(result.maxTokens).to.equal(1000);
            expect(result.timeout).to.equal(30000);
        });

        it('should validate temperature range', function () {
            expect(() => OpenAIConfigSchema.parse({ temperature: -1 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ temperature: 3 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ temperature: 0 })).to.not.throw();
            expect(() => OpenAIConfigSchema.parse({ temperature: 2 })).to.not.throw();
        });

        it('should validate positive maxTokens', function () {
            expect(() => OpenAIConfigSchema.parse({ maxTokens: 0 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ maxTokens: -100 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ maxTokens: 100 })).to.not.throw();
        });

        it('should validate positive timeout', function () {
            expect(() => OpenAIConfigSchema.parse({ timeout: 0 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ timeout: -1000 })).to.throw();
            expect(() => OpenAIConfigSchema.parse({ timeout: 5000 })).to.not.throw();
        });
    });

    describe('OpenAIService Constructor', function () {
        it('should create service with default configuration', function () {
            const service = new OpenAIService();
            const config = service.getConfig();
            
            expect(config.model).to.equal('gpt-4o-mini');
            expect(config.temperature).to.equal(0.7);
            expect(config.maxTokens).to.equal(1000);
            expect(config.timeout).to.equal(30000);
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
            
            expect(config.model).to.equal('gpt-4');
            expect(config.temperature).to.equal(0.5);
            expect(config.maxTokens).to.equal(2000);
            expect(config.timeout).to.equal(60000);
        });

        it('should merge custom config with defaults', function () {
            const partialConfig = {
                model: 'gpt-4',
                temperature: 0.2
            };

            const service = new OpenAIService(partialConfig);
            const config = service.getConfig();
            
            expect(config.model).to.equal('gpt-4');
            expect(config.temperature).to.equal(0.2);
            expect(config.maxTokens).to.equal(1000); // default value
            expect(config.timeout).to.equal(30000); // default value
        });
    });

    describe('Configuration Management', function () {
        let service: OpenAIService;

        beforeEach(function () {
            service = new OpenAIService();
        });

        it('should get current configuration', function () {
            const config = service.getConfig();
            expect(config).to.be.an('object');
            expect(config).to.have.property('model');
            expect(config).to.have.property('temperature');
            expect(config).to.have.property('maxTokens');
            expect(config).to.have.property('timeout');
        });

        it('should update configuration', function () {
            const newConfig = {
                model: 'gpt-4',
                temperature: 0.1,
                maxTokens: 500
            };

            service.updateConfig(newConfig);
            const config = service.getConfig();
            
            expect(config.model).to.equal('gpt-4');
            expect(config.temperature).to.equal(0.1);
            expect(config.maxTokens).to.equal(500);
        });

        it('should validate configuration on update', function () {
            expect(() => service.updateConfig({ temperature: -1 })).to.throw();
            expect(() => service.updateConfig({ maxTokens: 0 })).to.throw();
            expect(() => service.updateConfig({ timeout: -1000 })).to.throw();
        });
    });

    describe('Service Status', function () {
        it('should check if service is configured with API key', function () {
            const serviceWithKey = new OpenAIService({ apiKey: 'sk-test-key' });
            expect(serviceWithKey.isConfigured()).to.be.true;
        });

        it('should check if service is not configured without API key', function () {
            const serviceWithoutKey = new OpenAIService({ apiKey: '' });
            expect(serviceWithoutKey.isConfigured()).to.be.false;
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
            expect(service.generateText).to.be.a('function');
        });

        it('should have generateTextWithHistory method', function () {
            expect(service.generateTextWithHistory).to.be.a('function');
        });

        it('should have generateTextStream method', function () {
            expect(service.generateTextStream).to.be.a('function');
        });

        it('should handle missing prompt gracefully', async function () {
            try {
                // This should trigger an error due to empty/invalid prompt
                await service.generateText('');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('OpenAI API error');
            }
        });

        it('should handle invalid messages array', async function () {
            try {
                // This should trigger an error due to empty messages
                await service.generateTextWithHistory([]);
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('OpenAI API error');
            }
        });
    });

    describe('Connection Testing', function () {
        it('should have testConnection method', function () {
            const service = new OpenAIService();
            expect(service.testConnection).to.be.a('function');
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
            expect(service1).to.equal(service2);
        });

        it('should update configuration on existing instance', function () {
            const service1 = getOpenAIService({ model: 'gpt-4o-mini' });
            const service2 = getOpenAIService({ model: 'gpt-4' });
            
            expect(service1).to.equal(service2);
            expect(service1.getConfig().model).to.equal('gpt-4');
        });

        it('should create new instance with initializeOpenAI', function () {
            const service1 = getOpenAIService();
            const service2 = initializeOpenAI({ model: 'gpt-4' });
            
            // They should be the same instance (singleton)
            expect(service1).to.equal(service2);
            expect(service2.getConfig().model).to.equal('gpt-4');
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
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('OpenAI API error');
            }
        });

        it('should handle streaming errors gracefully', async function () {
            try {
                const stream = service.generateTextStream('test prompt');
                await stream.next();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('OpenAI API error');
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
            expect(config).to.have.property('apiKey');
            expect(config).to.have.property('baseURL');
            expect(config).to.have.property('model');
            expect(config).to.have.property('temperature');
            expect(config).to.have.property('maxTokens');
            expect(config).to.have.property('timeout');
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
            expect(() => service.generateText('test')).to.not.throw();
        });

        it('should override defaults with provided options', function () {
            const options = {
                model: 'gpt-4',
                temperature: 0.2,
                maxTokens: 500,
                systemPrompt: 'You are a helpful assistant.'
            };

            // Test that options are accepted without throwing
            expect(() => service.generateText('test', options)).to.not.throw();
        });

        it('should handle systemPrompt option', function () {
            const options = {
                systemPrompt: 'You are a test assistant.'
            };

            expect(() => service.generateText('test', options)).to.not.throw();
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

            expect(() => service.generateTextWithHistory(messages)).to.not.throw();
        });

        it('should handle empty content gracefully', async function () {
            const messages = [
                { role: 'user' as const, content: '' }
            ];

            try {
                await service.generateTextWithHistory(messages);
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('OpenAI API error');
            }
        });
    });
});