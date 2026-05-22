import { ResolverState, ValidationResult as StateValidationResult } from '@G/state';
import { validatePackageVersionsExist } from '@U/package-registry.utils';
import { readPackageJson } from '@U/package-json.utils';
import { getLogger } from '@U/index';
import { StrategicSuggestion } from '@I/index';
import { AIResponseFormatError, PackageVersionValidationError, NoNewSuggestionError, NoSuitableVersionFoundError } from '@E/index';
import { updateDependency } from '@U/package-json.utils';
import deepEqual from 'fast-deep-equal';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/**
 * Validation Node - Validates AI suggestions for correctness before applying.
 * 
 * This is a NON-LLM node. It performs three validation passes:
 * 
 * 1. FORMAT VALIDATION: Checks that the AI response is valid JSON with the
 *    correct structure (suggestions array with name, version, isDev fields)
 * 
 * 2. VERSION VALIDATION: Verifies each suggested version actually exists in
 *    the npm registry (prevents the LLM from hallucinating versions)
 * 
 * 3. NO-OP DETECTION: Checks that applying the suggestions would actually
 *    change package.json (prevents infinite loops of redundant suggestions)
 * 
 * If validation fails, it sets the appropriate error type and retry message
 * so the Strategist node can try again with better context.
 */
export async function validationNode(state: ResolverState): Promise<Partial<ResolverState>> {
    const logger = getLogger().child('node:validation');
    const { lastAiResponse, tempDir, reasoningRecording } = state;

    logger.info('Validating AI suggestions');

    // --- Pass 1: Format Validation ---
    let jsonString = lastAiResponse.trim();
    const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
    if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
    }

    let suggestions: any;
    try {
        suggestions = JSON.parse(jsonString);
    } catch (e) {
        logger.warn('AI response is not valid JSON');
        const err = new AIResponseFormatError('Response is not valid JSON');
        return {
            validationResult: {
                valid: false,
                suggestions: [],
                error: err.message,
                errorType: 'format',
                retryMessage: err.getRetryMessage(),
            },
        };
    }

    // Validate structure
    if (!suggestions || typeof suggestions !== 'object') {
        const err = new AIResponseFormatError('Invalid response: not an object');
        return {
            validationResult: {
                valid: false,
                suggestions: [],
                error: err.message,
                errorType: 'format',
                retryMessage: err.getRetryMessage(),
            },
        };
    }

    if (!suggestions.suggestions || !Array.isArray(suggestions.suggestions)) {
        const err = new AIResponseFormatError('Invalid response: missing or invalid suggestions array');
        return {
            validationResult: {
                valid: false,
                suggestions: [],
                error: err.message,
                errorType: 'format',
                retryMessage: err.getRetryMessage(),
            },
        };
    }

    // Validate each suggestion has required fields
    const invalidSuggestions = suggestions.suggestions.filter(
        (s: any) => !s || typeof s !== 'object' || !s.name || !s.version || typeof s.isDev !== 'boolean'
    );

    if (invalidSuggestions.length > 0) {
        const err = new AIResponseFormatError(
            `Invalid suggestions found: ${invalidSuggestions.length} items missing name, version, or isDev`
        );
        return {
            validationResult: {
                valid: false,
                suggestions: [],
                error: err.message,
                errorType: 'format',
                retryMessage: err.getRetryMessage(),
            },
        };
    }

    // --- Pass 2: Version Existence Validation ---
    try {
        const validationResults = await validatePackageVersionsExist(suggestions);
        const nonExistentVersions = validationResults.filter((r) => !r.exists);

        if (nonExistentVersions.length > 0) {
            const errorDetails = nonExistentVersions
                .map((r) => `${r.packageName}@${r.version}: ${r.error || 'Version not found'}`)
                .join('\n');
            const errorMessage = `Package version validation failed:\n${errorDetails}\n\nPlease suggest alternative versions that exist in the registry.`;

            logger.warn('Some suggested versions do not exist', {
                nonExistent: nonExistentVersions.map((r) => `${r.packageName}@${r.version}`),
            });

            const err = new PackageVersionValidationError(errorMessage);
            return {
                validationResult: {
                    valid: false,
                    suggestions: [],
                    error: err.message,
                    errorType: 'version',
                    retryMessage: err.getRetryMessage(),
                },
            };
        }
    } catch (error) {
        if (error instanceof NoSuitableVersionFoundError) {
            return {
                validationResult: {
                    valid: false,
                    suggestions: [],
                    error: error.message,
                    errorType: 'fatal',
                    retryMessage: undefined,
                },
            };
        }
        throw error;
    }

    // --- Pass 3: No-op Detection ---
    try {
        const packageJson = await readPackageJson(tempDir);
        const packageJsonBefore = JSON.parse(JSON.stringify(packageJson));

        for (const suggestion of suggestions.suggestions) {
            await updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);
        }

        if (deepEqual(packageJsonBefore, packageJson)) {
            const err = new NoNewSuggestionError(
                'AI suggested changes but package.json remains unchanged. Suggestions are redundant.'
            );
            logger.warn('No-op detected: suggestions would not change package.json');
            return {
                validationResult: {
                    valid: false,
                    suggestions: [],
                    error: err.message,
                    errorType: 'noop',
                    retryMessage: err.getRetryMessage(),
                },
            };
        }
    } catch (e) {
        // If we can't read package.json, let it proceed - apply node will catch it
        logger.warn('Could not perform no-op check', {
            error: e instanceof Error ? e.message : String(e),
        });
    }

    // --- All validations passed ---
    logger.info('All validations passed', {
        suggestionCount: suggestions.suggestions.length,
    });

    // Extract reasoning recording updates
    let updatedReasoning = { ...reasoningRecording };
    if (
        suggestions.reasoning?.updateMade &&
        Array.isArray(suggestions.reasoning.updateMade) &&
        suggestions.reasoning.updateMade.length > 0
    ) {
        updatedReasoning = {
            updateMade: [...reasoningRecording.updateMade, ...suggestions.reasoning.updateMade],
        };
    }

    return {
        validationResult: {
            valid: true,
            suggestions: suggestions.suggestions as StrategicSuggestion[],
        },
        reasoningRecording: updatedReasoning,
    };
}
