import * as vscode from 'vscode';
import { initializeLogger, getLogger } from '@U/logger.utils';
import { initializeLLM } from '@S/llm.service';
import { selectModel, listAvailableModels } from '@S/vscode-lm.service';
import { buildResolverGraph, DependencyUpdate } from '@G/index';
import { LogLevel } from '@I/logger.interfaces';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

let outputChannel: vscode.OutputChannel;

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
    // Create output channel
    outputChannel = vscode.window.createOutputChannel('NgPlusPlus');

    // Initialize logger with output channel
    const logLevelMap: Record<string, LogLevel> = {
        error: LogLevel.ERROR,
        warn: LogLevel.WARN,
        info: LogLevel.INFO,
        debug: LogLevel.DEBUG,
        trace: LogLevel.TRACE,
    };

    const config = vscode.workspace.getConfiguration('ngplusplus');
    const logLevelStr = config.get<string>('logLevel', 'info');

    const logger = initializeLogger({
        level: logLevelMap[logLevelStr] ?? LogLevel.INFO,
        enableConsoleLogging: false,
        enableFileLogging: false,
    });
    logger.setOutputChannel(outputChannel);
    logger.info('NgPlusPlus extension activated');

    // Initialize LLM service from settings
    refreshLLMConfig();

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ngplusplus')) {
                refreshLLMConfig();

                // Update log level
                const newLogLevel = vscode.workspace
                    .getConfiguration('ngplusplus')
                    .get<string>('logLevel', 'info');
                getLogger().setLevel(logLevelMap[newLogLevel] ?? LogLevel.INFO);
            }
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ngplusplus.upgrade', () => runUpgrade()),
        vscode.commands.registerCommand('ngplusplus.selectModel', () => runSelectModel()),
        vscode.commands.registerCommand('ngplusplus.showConfig', () => runShowConfig())
    );

    context.subscriptions.push(outputChannel);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate() {
    // Cleanup handled by disposables
}

// --- Configuration ---

function refreshLLMConfig(): void {
    const config = vscode.workspace.getConfiguration('ngplusplus');
    const provider = config.get<'vscode' | 'openai'>('llmProvider', 'vscode');

    initializeLLM({
        provider,
        apiKey: config.get<string>('openai.apiKey', ''),
        baseURL: config.get<string>('openai.baseUrl', 'https://api.openai.com/v1'),
        model: config.get<string>('openai.model', 'gpt-4'),
        temperature: config.get<number>('openai.temperature', 0.3),
        maxTokens: config.get<number>('openai.maxTokens', 2000),
        timeout: config.get<number>('openai.timeout', 60000),
    });
}

// --- Commands ---

/**
 * Main upgrade command - prompts for project path and dependencies, then runs
 * the LangGraph resolver workflow.
 */
async function runUpgrade(): Promise<void> {
    const logger = getLogger().child('Command:Upgrade');
    outputChannel.show(true);

    try {
        // Step 1: Determine the workspace/project path
        const repoPath = await pickProjectPath();
        if (!repoPath) return;

        const packageJsonPath = join(repoPath, 'package.json');
        if (!existsSync(packageJsonPath)) {
            vscode.window.showErrorMessage(`package.json not found at ${repoPath}`);
            return;
        }

        // Step 2: Read current package.json for context
        let currentPackageJson: any = {};
        try {
            currentPackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        } catch {
            vscode.window.showErrorMessage('Failed to parse package.json');
            return;
        }

        // Step 3: Prompt for dependencies to upgrade
        const depsInput = await vscode.window.showInputBox({
            title: 'NgPlusPlus: Dependencies to Upgrade',
            prompt: 'Enter dependencies to upgrade (space-separated). Format: name@version[:dev]',
            placeHolder: '@angular/core@19.0.0 @angular/cli@19.0.0 typescript@5.6.0:dev',
            validateInput: (value) => {
                if (!value.trim()) return 'Please enter at least one dependency';
                return null;
            },
        });

        if (!depsInput) return;

        const updateDependencies = parseDependencies(depsInput.trim().split(/\s+/), repoPath, currentPackageJson);
        if (updateDependencies.length === 0) {
            vscode.window.showErrorMessage('No valid dependencies specified. Use format: name@version[:dev]');
            return;
        }

        // Step 4: Get max attempts from settings
        const config = vscode.workspace.getConfiguration('ngplusplus');
        const maxAttempts = config.get<number>('maxAttempts', 200);

        // Step 5: Run the resolver graph with progress
        logger.info('Starting upgrade', {
            repoPath,
            dependencies: updateDependencies.map((d) => `${d.name}@${d.version}`),
            maxAttempts,
        });

        outputChannel.appendLine('');
        outputChannel.appendLine('=== NgPlusPlus - Angular Upgrade Agent ===');
        outputChannel.appendLine('');
        outputChannel.appendLine(`Repository: ${repoPath}`);
        outputChannel.appendLine(`Max attempts: ${maxAttempts}`);
        outputChannel.appendLine('Dependencies to upgrade:');
        for (const dep of updateDependencies) {
            outputChannel.appendLine(`  - ${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`);
        }
        outputChannel.appendLine('');

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'NgPlusPlus: Upgrading Angular dependencies...',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Building resolver graph...' });

                const graph = buildResolverGraph();
                logger.info('LangGraph resolver graph compiled');

                progress.report({ message: 'Running multi-agent resolution...' });

                const result = await graph.invoke({
                    repoPath,
                    updateDependencies,
                    maxAttempts,
                    tempDir: '',
                    attempt: 0,
                    aiRetryAttempt: 0,
                    maxAiRetries: 5,
                    installSuccess: false,
                    installOutput: '',
                    installError: '',
                    conflictAnalysis: null,
                    reasoningRecording: { updateMade: [] },
                    messages: [],
                    strategistMessages: [],
                    validationResult: null,
                    lastAiResponse: '',
                    finalStatus: 'failure' as const,
                    finalMessage: '',
                    copyBackErrors: [],
                });

                // Display results
                outputChannel.appendLine('');
                outputChannel.appendLine('=== Resolution Result ===');
                outputChannel.appendLine('');

                if (result.finalStatus === 'success') {
                    outputChannel.appendLine('STATUS: SUCCESS');
                    outputChannel.appendLine('');
                    outputChannel.appendLine(result.finalMessage);
                    vscode.window.showInformationMessage(
                        'NgPlusPlus: Dependencies upgraded successfully!'
                    );
                } else if (result.finalStatus === 'partial') {
                    outputChannel.appendLine('STATUS: PARTIAL SUCCESS');
                    outputChannel.appendLine('');
                    outputChannel.appendLine(result.finalMessage);
                    vscode.window.showWarningMessage(
                        'NgPlusPlus: Dependencies partially resolved. Check Output for details.'
                    );
                } else {
                    outputChannel.appendLine('STATUS: FAILED');
                    outputChannel.appendLine('');
                    outputChannel.appendLine(result.finalMessage);
                    vscode.window.showErrorMessage(
                        'NgPlusPlus: Failed to resolve dependencies. Check Output for details.'
                    );
                }
            }
        );
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Fatal error in upgrade', { error: errorMsg });
        outputChannel.appendLine(`\nFatal error: ${errorMsg}`);
        vscode.window.showErrorMessage(`NgPlusPlus: Fatal error - ${errorMsg}`);
    }
}

/**
 * Select LLM model command
 */
async function runSelectModel(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ngplusplus');
    const provider = config.get<'vscode' | 'openai'>('llmProvider', 'vscode');

    if (provider === 'openai') {
        vscode.window.showInformationMessage(
            'LLM provider is set to "openai". Model selection is only available for VS Code LM provider. Change ngplusplus.llmProvider to "vscode" to use this feature.'
        );
        return;
    }

    const model = await selectModel();
    if (model) {
        vscode.window.showInformationMessage(`NgPlusPlus: Selected model "${model.name}" (${model.id})`);
    }
}

/**
 * Show config command
 */
async function runShowConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ngplusplus');
    const provider = config.get<string>('llmProvider', 'vscode');

    outputChannel.show(true);
    outputChannel.appendLine('');
    outputChannel.appendLine('=== NgPlusPlus Configuration ===');
    outputChannel.appendLine('');
    outputChannel.appendLine(`LLM Provider: ${provider}`);
    outputChannel.appendLine('');

    if (provider === 'vscode') {
        const modelId = config.get<string>('vscodeModel', '');
        outputChannel.appendLine(`VS Code Model ID: ${modelId || '(not selected)'}`);

        try {
            const models = await listAvailableModels();
            outputChannel.appendLine(`Available models (${models.length}):`);
            for (const m of models) {
                const marker = m.id === modelId ? ' <-- selected' : '';
                outputChannel.appendLine(`  - ${m.name} (${m.id}) [${m.vendor}/${m.family}]${marker}`);
            }
        } catch {
            outputChannel.appendLine('  (Could not list available models)');
        }
    } else {
        outputChannel.appendLine(`OpenAI Base URL: ${config.get<string>('openai.baseUrl', 'https://api.openai.com/v1')}`);
        outputChannel.appendLine(`OpenAI API Key: ${config.get<string>('openai.apiKey', '') ? '***configured***' : '(not set)'}`);
        outputChannel.appendLine(`OpenAI Model: ${config.get<string>('openai.model', 'gpt-4')}`);
        outputChannel.appendLine(`Temperature: ${config.get<number>('openai.temperature', 0.3)}`);
        outputChannel.appendLine(`Max Tokens: ${config.get<number>('openai.maxTokens', 2000)}`);
        outputChannel.appendLine(`Timeout: ${config.get<number>('openai.timeout', 60000)}ms`);
    }

    outputChannel.appendLine('');
    outputChannel.appendLine(`Max Attempts: ${config.get<number>('maxAttempts', 200)}`);
    outputChannel.appendLine(`Log Level: ${config.get<string>('logLevel', 'info')}`);
    outputChannel.appendLine('');
}

// --- Helpers ---

/**
 * Pick the project path: current workspace folder or browse
 */
async function pickProjectPath(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length === 1) {
        // Single workspace folder - check if it has package.json
        const wsPath = workspaceFolders[0].uri.fsPath;
        if (existsSync(join(wsPath, 'package.json'))) {
            return wsPath;
        }
    }

    if (workspaceFolders && workspaceFolders.length > 1) {
        // Multiple workspace folders - let user pick
        const items = workspaceFolders
            .filter((f) => existsSync(join(f.uri.fsPath, 'package.json')))
            .map((f) => ({
                label: f.name,
                description: f.uri.fsPath,
                fsPath: f.uri.fsPath,
            }));

        if (items.length > 0) {
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select the Angular project to upgrade',
            });
            if (picked) return picked.fsPath;
            return undefined;
        }
    }

    // No workspace with package.json - let user browse
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Angular Project Root',
        title: 'Select the folder containing package.json',
    });

    if (uris && uris.length > 0) {
        return uris[0].fsPath;
    }

    return undefined;
}

/**
 * Parse dependency arguments into DependencyUpdate objects.
 * Format: name@version[:dev]
 */
function parseDependencies(deps: string[], repoPath: string, currentPackageJson: any): DependencyUpdate[] {
    const allDeps = {
        ...(currentPackageJson.dependencies || {}),
        ...(currentPackageJson.devDependencies || {}),
    };

    return deps
        .map((dep) => {
            let isDev = false;
            let depStr = dep;
            if (depStr.endsWith(':dev')) {
                isDev = true;
                depStr = depStr.slice(0, -4);
            }

            const lastAtIdx = depStr.lastIndexOf('@');
            if (lastAtIdx <= 0) {
                vscode.window.showWarningMessage(`Invalid dependency format: ${dep}. Expected name@version[:dev]`);
                return null;
            }

            const name = depStr.substring(0, lastAtIdx);
            const version = depStr.substring(lastAtIdx + 1);

            if (!name || !version) {
                vscode.window.showWarningMessage(`Invalid dependency format: ${dep}. Expected name@version[:dev]`);
                return null;
            }

            // Auto-detect isDev from current package.json
            if (!isDev && currentPackageJson.devDependencies?.[name]) {
                isDev = true;
            }

            const fromVersion = allDeps[name] || 'unknown';

            return {
                name,
                version,
                isDev,
                reason: `User requested upgrade to ${version}`,
                fromVersion,
            };
        })
        .filter(Boolean) as DependencyUpdate[];
}
