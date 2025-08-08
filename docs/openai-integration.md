# OpenAI Integration Guide

This guide shows how to integrate OpenAI LLM into your MCP server following standard patterns.

## Overview

The OpenAI integration is designed with the following principles:
- **Centralized configuration** via environment variables and runtime updates
- **Singleton service pattern** for consistent usage across tools
- **Comprehensive error handling** with meaningful error messages
- **Flexible parameter overrides** for different use cases
- **Security-first approach** with no API key exposure

## Quick Start

### 1. Set Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=1000
```

### 2. Use the OpenAI Service

```typescript
import { getOpenAIService } from '../utils/index.js';

// Get the service instance
const openAI = getOpenAIService();

// Check if configured
if (!openAI.isConfigured()) {
    throw new Error('OpenAI not configured');
}

// Generate text
const response = await openAI.generateText(
    "Explain TypeScript interfaces",
    {
        systemPrompt: "You are a helpful programming tutor",
        temperature: 0.5,
        maxTokens: 500
    }
);
```

## Architecture

### Service Layer (`src/utils/openai.service.ts`)
- **OpenAIService class**: Main service with configuration management
- **getOpenAIService()**: Singleton access function
- **Configuration schema**: Zod validation for all settings

### Tools Layer (`src/tools/openai.tool.ts`)
- **openai_configure**: Update OpenAI settings
- **openai_status**: Check configuration and test connection
- **ai_generate_text**: General purpose text generation

### Enhanced Tools (`src/tools/echo.tool.ts`)
- **echo_ai_enhanced**: Echo with AI-powered improvements

## Available Tools

### Configuration Tools

#### `openai_configure`
Update OpenAI configuration at runtime:
- `apiKey`: OpenAI API key
- `model`: Model to use (gpt-4o-mini, gpt-4, etc.)
- `temperature`: Randomness level (0.0-2.0)
- `maxTokens`: Maximum response length
- `baseURL`: Custom API endpoint

#### `openai_status`
Check current configuration and optionally test connection:
- `testConnection`: Whether to test API connectivity

### Text Generation Tools

#### `ai_generate_text`
General purpose text generation:
- `prompt`: The prompt for generation
- `systemPrompt`: System context/behavior
- `model`: Override default model
- `temperature`: Override default temperature
- `maxTokens`: Override default max tokens

#### `echo_ai_enhanced`
Enhanced echo with AI improvements:
- `text`: Text to enhance
- `enhancement`: Type of enhancement (grammar_fix, style_improve, etc.)
- `customPrompt`: Custom enhancement instruction
- `includeOriginal`: Show both original and enhanced text

## Usage Patterns

### 1. Basic Text Generation
```typescript
const openAI = getOpenAIService();
const response = await openAI.generateText("Your prompt here");
```

### 2. With Configuration Override
```typescript
const response = await openAI.generateText(
    "Explain quantum computing",
    {
        systemPrompt: "You are a physics professor",
        model: "gpt-4",
        temperature: 0.3,
        maxTokens: 800
    }
);
```

### 3. Conversation History
```typescript
const messages = [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi! How can I help?' },
    { role: 'user', content: 'Tell me about TypeScript' }
];

const response = await openAI.generateTextWithHistory(messages);
```

### 4. Streaming Responses
```typescript
for await (const chunk of openAI.generateTextStream("Tell me a story")) {
    process.stdout.write(chunk);
}
```

### 5. Error Handling Pattern
```typescript
async function safeGenerate(prompt: string) {
    try {
        const openAI = getOpenAIService();
        
        if (!openAI.isConfigured()) {
            return { error: 'OpenAI not configured' };
        }
        
        const response = await openAI.generateText(prompt);
        return { success: true, text: response };
    } catch (error) {
        return { 
            error: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
```

## Configuration Management

### Environment Variables
The service automatically reads these environment variables:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TEMPERATURE`
- `OPENAI_MAX_TOKENS`
- `OPENAI_TIMEOUT`
- `OPENAI_BASE_URL`

### Runtime Configuration
You can update configuration at runtime:
```typescript
const openAI = getOpenAIService();
openAI.updateConfig({
    model: 'gpt-4',
    temperature: 0.5
});
```

### Configuration Validation
All configuration is validated using Zod schemas:
- API keys are optional (for flexibility)
- Temperature must be 0.0-2.0
- Max tokens must be positive
- Timeout must be positive

## Best Practices

### 1. Always Check Configuration
```typescript
const openAI = getOpenAIService();
if (!openAI.isConfigured()) {
    // Handle unconfigured state
    return { error: 'OpenAI not configured' };
}
```

### 2. Use Appropriate Temperature
- **0.0-0.3**: Factual, deterministic
- **0.4-0.7**: Balanced (recommended)
- **0.8-1.0**: Creative
- **1.1-2.0**: Highly creative (experimental)

### 3. Handle Errors Gracefully
```typescript
try {
    const response = await openAI.generateText(prompt);
    return { content: [{ type: 'text', text: response }] };
} catch (error) {
    return { 
        content: [{ 
            type: 'text', 
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }] 
    };
}
```

### 4. Use System Prompts Effectively
```typescript
const systemPrompt = [
    "You are a professional code reviewer.",
    "Provide constructive feedback on:",
    "- Code quality and best practices",
    "- Performance optimizations", 
    "- Security considerations",
    "- Maintainability improvements"
].join(' ');
```

### 5. Manage Token Limits
```typescript
// For different use cases
const configs = {
    summary: { maxTokens: 200, temperature: 0.3 },
    explanation: { maxTokens: 800, temperature: 0.5 },
    creative: { maxTokens: 1500, temperature: 0.8 }
};
```

## Security Notes

1. **Never log API keys** - The service masks them in responses
2. **Use environment variables** for sensitive configuration
3. **Validate user inputs** before sending to OpenAI
4. **Monitor API usage** and implement rate limiting for production
5. **Handle errors without exposing internal details**

## Testing

Test your OpenAI integration:
```bash
# Set your API key
export OPENAI_API_KEY="your-key-here"

# Build and run
npm run build
./build/index.js

# In another terminal, test with MCP client
# Use tools: openai_status, openai_configure, ai_generate_text
```

## Extending the Integration

To add new AI-powered tools:

1. Import the service:
```typescript
import { getOpenAIService } from '../utils/index.js';
```

2. Check configuration:
```typescript
const openAI = getOpenAIService();
if (!openAI.isConfigured()) {
    return { error: 'OpenAI not configured' };
}
```

3. Use the service methods:
```typescript
const response = await openAI.generateText(prompt, options);
```

This pattern ensures consistent OpenAI usage across all your MCP tools and resources.
