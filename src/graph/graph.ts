import { StateGraph, END, START } from '@langchain/langgraph';
import { ResolverStateAnnotation, ResolverState } from './state';
import {
    setupNode,
    targetUpdateNode,
    installNode,
    errorParserNode,
    rankingNode,
    registryNode,
    strategistNode,
    validationNode,
    applyNode,
    cleanupNode,
} from './nodes/index';

/**
 * Angular Upgrade Resolver - LangGraph Multi-Agent Workflow
 * 
 * This graph implements the same algorithm as the original dumb_resolver MCP tool,
 * but decomposed into discrete, inspectable graph nodes.
 * 
 * GRAPH FLOW:
 * 
 *   setup --> targetUpdate --> install ---> (success?) ---> cleanup
 *                               ^            (failure?)
 *                               |                |
 *                             apply          errorParser
 *                               ^                |
 *                               |             ranking (LLM)
 *                           validation            |
 *                               ^             registry
 *                               |                |
 *                            strategist (LLM) <--+
 *                               ^
 *                               |
 *                          (AI retry loop - validation bounces back to strategist)
 * 
 * LLM Nodes: ranking, strategist
 * Non-LLM Nodes: setup, targetUpdate, install, errorParser, registry, validation, apply, cleanup
 */

// --- Routing Functions ---

/**
 * After setup: check if setup succeeded (tempDir exists) or failed early
 */
function routeAfterSetup(state: ResolverState): string {
    if (state.finalStatus === 'failure' && state.finalMessage) {
        return 'cleanup';
    }
    return 'targetUpdate';
}

/**
 * After install: success goes to cleanup, failure goes to analysis pipeline
 */
function routeAfterInstall(state: ResolverState): string {
    if (state.installSuccess) {
        return 'cleanup';
    }

    // Check if we've exceeded max attempts
    if (state.attempt >= state.maxAttempts) {
        return 'cleanup';
    }

    return 'errorParser';
}

/**
 * After validation: valid suggestions go to apply, invalid bounce back to strategist,
 * fatal errors go to cleanup
 */
function routeAfterValidation(state: ResolverState): string {
    const result = state.validationResult;

    if (!result) {
        return 'cleanup';
    }

    if (result.valid) {
        return 'apply';
    }

    // Fatal error (e.g., NoSuitableVersionFoundError) - stop trying
    if (result.errorType === 'fatal') {
        return 'cleanup';
    }

    // Check AI retry limit
    if (state.aiRetryAttempt >= state.maxAiRetries) {
        return 'cleanup';
    }

    // Bounce back to strategist with retry message
    return 'strategist';
}

/**
 * Build and return the compiled LangGraph state graph
 */
export function buildResolverGraph() {
    const graph = new StateGraph(ResolverStateAnnotation)
        // --- Register Nodes ---
        .addNode('setup', setupNode)
        .addNode('targetUpdate', targetUpdateNode)
        .addNode('install', installNode)
        .addNode('errorParser', errorParserNode)
        .addNode('ranking', rankingNode)
        .addNode('registry', registryNode)
        .addNode('strategist', strategistNode)
        .addNode('validation', validationNode)
        .addNode('apply', applyNode)
        .addNode('cleanup', cleanupNode)

        // --- Define Edges ---

        // Entry point
        .addEdge(START, 'setup')

        // Setup -> conditional: success or early failure
        .addConditionalEdges('setup', routeAfterSetup, {
            targetUpdate: 'targetUpdate',
            cleanup: 'cleanup',
        })

        // TargetUpdate -> Install
        .addEdge('targetUpdate', 'install')

        // Install -> conditional: success or analysis pipeline
        .addConditionalEdges('install', routeAfterInstall, {
            cleanup: 'cleanup',
            errorParser: 'errorParser',
        })

        // Analysis pipeline: errorParser -> ranking -> registry -> strategist
        .addEdge('errorParser', 'ranking')
        .addEdge('ranking', 'registry')
        .addEdge('registry', 'strategist')

        // Strategist -> Validation
        .addEdge('strategist', 'validation')

        // Validation -> conditional: apply, retry strategist, or cleanup
        .addConditionalEdges('validation', routeAfterValidation, {
            apply: 'apply',
            strategist: 'strategist',
            cleanup: 'cleanup',
        })

        // Apply -> Install (back to the main loop)
        .addEdge('apply', 'install')

        // Cleanup -> END
        .addEdge('cleanup', END);

    return graph.compile();
}
