import * as vscode from 'vscode';
import { getLogger, ChildLogger } from '@U/logger.utils';

/**
 * VS Code Language Model API adapter.
 * 
 * Wraps vscode.lm.selectChatModels() to provide language model access
 * using VS Code's built-in LM API (GitHub Copilot, etc.).
 * 
 * This adapter translates our internal message format to the VS Code LM API,
 * and provides model discovery/selection functionality.
 */

let selectedModel: vscode.LanguageModelChat | null = null;
let logger: ChildLogger;

function getLog(): ChildLogger {
    if (!logger) {
        logger = getLogger().child('VscodeLM');
    }
    return logger;
}

/**
 * List all available VS Code language models
 */
export async function listAvailableModels(): Promise<vscode.LanguageModelChat[]> {
    const models = await vscode.lm.selectChatModels();
    getLog().info('Available VS Code language models', {
        count: models.length,
        models: models.map((m) => ({ id: m.id, name: m.name, vendor: m.vendor, family: m.family })),
    });
    return models;
}

/**
 * Select a specific model by its ID. If no ID is provided, prompts the user
 * with a QuickPick of all available models.
 */
export async function selectModel(modelId?: string): Promise<vscode.LanguageModelChat | null> {
    const models = await listAvailableModels();

    if (models.length === 0) {
        vscode.window.showWarningMessage(
            'No language models available in VS Code. Install GitHub Copilot or another LM extension, or switch to OpenAI provider in settings.'
        );
        return null;
    }

    if (modelId) {
        const found = models.find((m) => m.id === modelId);
        if (found) {
            selectedModel = found;
            getLog().info('Model selected by ID', { id: found.id, name: found.name });
            return found;
        }
        getLog().warn('Model ID not found, prompting user', { requestedId: modelId });
    }

    // Prompt user to select a model
    const items: vscode.QuickPickItem[] = models.map((m) => ({
        label: m.name || m.id,
        description: `${m.vendor} / ${m.family}`,
        detail: m.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Language Model for NgPlusPlus',
        title: 'NgPlusPlus: Select LLM Model',
    });

    if (!picked) {
        return selectedModel; // User cancelled, keep existing selection
    }

    const chosen = models.find((m) => m.id === picked.detail);
    if (chosen) {
        selectedModel = chosen;
        getLog().info('Model selected by user', { id: chosen.id, name: chosen.name });

        // Save to settings
        const config = vscode.workspace.getConfiguration('ngplusplus');
        await config.update('vscodeModel', chosen.id, vscode.ConfigurationTarget.Global);
    }

    return selectedModel;
}

/**
 * Get the currently selected VS Code LM model, or auto-select one.
 */
export async function getSelectedModel(): Promise<vscode.LanguageModelChat | null> {
    if (selectedModel) return selectedModel;

    // Try to load from settings
    const config = vscode.workspace.getConfiguration('ngplusplus');
    const savedModelId = config.get<string>('vscodeModel');

    if (savedModelId) {
        const model = await selectModel(savedModelId);
        if (model) return model;
    }

    // No saved model or it wasn't found - prompt user
    return selectModel();
}

/**
 * Send a request to the VS Code language model.
 * 
 * @param messages Array of {role, content} messages
 * @returns The model's response text
 */
export async function invokeVscodeLM(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
    const model = await getSelectedModel();
    if (!model) {
        throw new Error('No VS Code language model selected. Please select a model first.');
    }

    // Convert to VS Code LM message format
    const vsMessages: vscode.LanguageModelChatMessage[] = messages
        .filter((m) => m.role !== 'system') // System messages handled separately
        .map((m) => {
            if (m.role === 'assistant') {
                return vscode.LanguageModelChatMessage.Assistant(m.content);
            }
            return vscode.LanguageModelChatMessage.User(m.content);
        });

    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === 'system');

    // Prepend system content as first user message if present (VS Code LM API
    // doesn't have a dedicated system role - we wrap it as context)
    if (systemMessage) {
        vsMessages.unshift(
            vscode.LanguageModelChatMessage.User(
                `[SYSTEM INSTRUCTIONS]\n${systemMessage.content}\n[END SYSTEM INSTRUCTIONS]`
            )
        );
    }

    getLog().debug('Sending request to VS Code LM', {
        model: model.id,
        messageCount: vsMessages.length,
    });

    try {
        const response = await model.sendRequest(vsMessages, {}, new vscode.CancellationTokenSource().token);

        // Collect streamed response
        let result = '';
        for await (const chunk of response.text) {
            result += chunk;
        }

        getLog().debug('VS Code LM response received', { length: result.length });
        return result;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        getLog().error('VS Code LM request failed', { error: errorMsg });
        throw new Error(`VS Code LM request failed: ${errorMsg}`);
    }
}
