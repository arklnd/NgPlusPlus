import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { ConflictAnalysis, ReasoningRecording, StrategicSuggestion } from '@I/index';

/**
 * Dependency update input - what the user wants to upgrade
 */
export interface DependencyUpdate {
    name: string;
    version: string;
    isDev: boolean;
    reason: string;
    fromVersion: string;
}

/**
 * Validation result from the validation node
 */
export interface ValidationResult {
    valid: boolean;
    suggestions: StrategicSuggestion[];
    error?: string;
    errorType?: 'format' | 'version' | 'noop' | 'fatal';
    retryMessage?: string;
}

/**
 * LangGraph state annotation for the Angular upgrade resolver workflow.
 * 
 * This state flows through the multi-agent graph, accumulating context
 * at each node. The state design mirrors the original dumb_resolver's
 * data flow but makes it explicit and inspectable.
 */
export const ResolverStateAnnotation = Annotation.Root({
    // --- Input Configuration ---
    repoPath: Annotation<string>,
    updateDependencies: Annotation<DependencyUpdate[]>,
    maxAttempts: Annotation<number>,

    // --- Working State ---
    tempDir: Annotation<string>,
    attempt: Annotation<number>,
    aiRetryAttempt: Annotation<number>,
    maxAiRetries: Annotation<number>,
    installSuccess: Annotation<boolean>,
    installOutput: Annotation<string>,
    installError: Annotation<string>,

    // --- Analysis State ---
    conflictAnalysis: Annotation<ConflictAnalysis | null>,
    reasoningRecording: Annotation<ReasoningRecording>,

    // --- LLM Interaction State ---
    messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => [...current, ...update],
        default: () => [],
    }),
    strategistMessages: Annotation<BaseMessage[]>({
        reducer: (current, update) => [...current, ...update],
        default: () => [],
    }),

    // --- Validation State ---
    validationResult: Annotation<ValidationResult | null>,
    lastAiResponse: Annotation<string>,

    // --- Output State ---
    finalStatus: Annotation<'success' | 'failure' | 'partial'>,
    finalMessage: Annotation<string>,
    copyBackErrors: Annotation<string[]>({
        reducer: (current, update) => [...current, ...update],
        default: () => [],
    }),
});

export type ResolverState = typeof ResolverStateAnnotation.State;
