import { ResolverState } from '@G/state';
import { createEnhancedSystemPrompt, createStrategicPrompt } from '@U/dumb-resolver-helper';
import { readPackageJson } from '@U/package-json.utils';
import { invokeWithHistory, toMessages } from '@S/llm.service';
import { getLogger } from '@U/index';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

/**
 * Strategist Node - Uses LLM to generate strategic resolution suggestions.
 * 
 * This is the core LLM-powered node. It:
 * 1. Builds a system prompt explaining the strategic dependency resolution role
 * 2. Creates a strategic prompt with the full conflict context (error, rankings,
 *    available versions, previous reasoning chain)
 * 3. Sends the context to the LLM for intelligent resolution suggestions
 * 4. Returns the raw LLM response for the Validation node to process
 * 
 * On AI retry (when the Validation node bounces back), it includes
 * the retry error message in the conversation history.
 */
export async function strategistNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:strategist');
    const {
        tempDir,
        conflictAnalysis,
        reasoningRecording,
        installError,
        updateDependencies,
        attempt,
        maxAttempts,
        aiRetryAttempt,
        validationResult,
    } = state;

    const currentAiRetry = aiRetryAttempt + 1;
    logger.info(`Generating strategic suggestions (AI retry ${currentAiRetry})`, {
        attempt,
        conflictCount: conflictAnalysis?.conflicts.length ?? 0,
    });

    // Build the strategic prompt with full context
    const systemMessage = createEnhancedSystemPrompt();
    const currentPackageJson = await readPackageJson(tempDir);

    const strategicPrompt = createStrategicPrompt(
        reasoningRecording,
        installError,
        conflictAnalysis!,
        updateDependencies
            .map((dep) => `- ${dep.name} to version ${dep.version} (${dep.isDev ? 'dev' : 'prod'})`)
            .join('\n'),
        attempt,
        maxAttempts
    );

    // Build message history
    const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage(
            `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT:\n${JSON.stringify(currentPackageJson)}`
        ),
        new HumanMessage(strategicPrompt),
    ];

    // If this is a retry, add the previous AI response and the error feedback
    if (currentAiRetry > 1 && validationResult?.retryMessage) {
        // Add previous AI response to history if we have one
        if (state.lastAiResponse) {
            messages.push(new AIMessage(state.lastAiResponse));
        }
        messages.push(new HumanMessage(validationResult.retryMessage));
    }

    try {
        const response = await invokeWithHistory(messages, {
            temperature: 0.3,
            maxTokens: 2000,
        });

        logger.info('LLM response received', {
            responseLength: response.length,
            aiRetry: currentAiRetry,
        });

        return {
            lastAiResponse: response,
            aiRetryAttempt: currentAiRetry,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('LLM invocation failed', { error: errorMsg, aiRetry: currentAiRetry });

        return {
            lastAiResponse: '',
            aiRetryAttempt: currentAiRetry,
            validationResult: {
                valid: false,
                suggestions: [],
                error: errorMsg,
                errorType: 'format',
                retryMessage: `LLM call failed: ${errorMsg}. Please try again.`,
            },
        };
    }
}
