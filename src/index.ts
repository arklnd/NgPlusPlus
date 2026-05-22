#!/usr/bin/env node

import { Command } from 'commander';
import { buildResolverGraph, DependencyUpdate } from '@G/index';
import { getLLM } from '@S/llm.service';
import { initializeLogger, getLogger } from '@U/logger.utils';
import { LogLevel } from '@I/logger.interfaces';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

dotenv.config();

const program = new Command();

program
    .name('ngpp')
    .description('Angular major version upgrade CLI agent - AI-powered dependency resolution using LangGraph multi-agent workflow')
    .version('1.0.0');

program
    .command('upgrade')
    .description('Upgrade Angular project dependencies to target versions')
    .requiredOption('-p, --path <path>', 'Path to the repository/project root directory')
    .requiredOption(
        '-d, --deps <deps...>',
        'Dependencies to update in format: name@version[:dev] (e.g., @angular/core@20.0.0 typescript@5.8.0:dev)'
    )
    .option('-m, --max-attempts <number>', 'Maximum resolution attempts', '200')
    .option('--log-level <level>', 'Log level: error, warn, info, debug, trace', 'info')
    .action(async (options) => {
        // Initialize logger
        const logLevelMap: Record<string, LogLevel> = {
            error: LogLevel.ERROR,
            warn: LogLevel.WARN,
            info: LogLevel.INFO,
            debug: LogLevel.DEBUG,
            trace: LogLevel.TRACE,
        };
        initializeLogger({
            level: logLevelMap[options.logLevel] ?? LogLevel.INFO,
            enableConsoleLogging: true,
        });
        const logger = getLogger().child('CLI');

        // Parse dependencies
        const updateDependencies: DependencyUpdate[] = parseDependencies(options.deps, options.path);
        if (updateDependencies.length === 0) {
            console.error('No valid dependencies specified. Use format: name@version[:dev]');
            process.exit(1);
        }

        const repoPath = resolve(options.path);
        if (!existsSync(resolve(repoPath, 'package.json'))) {
            console.error(`package.json not found at ${repoPath}`);
            process.exit(1);
        }

        console.log('\n=== NgPlusPlus - Angular Upgrade Agent ===\n');
        console.log(`Repository: ${repoPath}`);
        console.log(`Max attempts: ${options.maxAttempts}`);
        console.log(`Dependencies to upgrade:`);
        for (const dep of updateDependencies) {
            console.log(`  - ${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`);
        }
        console.log('');

        // Initialize LLM
        getLLM();
        logger.info('LLM service initialized');

        // Build and run the graph
        const graph = buildResolverGraph();
        logger.info('LangGraph resolver graph compiled');

        console.log('Starting multi-agent dependency resolution workflow...\n');

        try {
            const result = await graph.invoke({
                repoPath,
                updateDependencies,
                maxAttempts: parseInt(options.maxAttempts),
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
            console.log('\n=== Resolution Result ===\n');

            if (result.finalStatus === 'success') {
                console.log('STATUS: SUCCESS\n');
                console.log(result.finalMessage);
            } else if (result.finalStatus === 'partial') {
                console.log('STATUS: PARTIAL SUCCESS\n');
                console.log(result.finalMessage);
            } else {
                console.log('STATUS: FAILED\n');
                console.log(result.finalMessage);
                process.exit(1);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`\nFatal error: ${errorMsg}`);
            logger.error('Fatal error in graph execution', { error: errorMsg });
            process.exit(1);
        }
    });

program
    .command('config')
    .description('Show current configuration')
    .action(() => {
        console.log('\n=== NgPlusPlus Configuration ===\n');
        console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '***' + process.env.OPENAI_API_KEY.slice(-4) : 'not set'}`);
        console.log(`OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1 (default)'}`);
        console.log(`OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'gpt-4 (default)'}`);
        console.log(`OPENAI_TEMPERATURE: ${process.env.OPENAI_TEMPERATURE || '0.3 (default)'}`);
        console.log(`OPENAI_MAX_TOKENS: ${process.env.OPENAI_MAX_TOKENS || '2000 (default)'}`);
        console.log(`OPENAI_TIMEOUT: ${process.env.OPENAI_TIMEOUT || '60000 (default)'}`);
    });

/**
 * Parse CLI dependency arguments into DependencyUpdate objects
 * Format: name@version[:dev]
 * Example: @angular/core@20.0.0  typescript@5.8.0:dev
 */
function parseDependencies(deps: string[], repoPath: string): DependencyUpdate[] {
    // Read current package.json to get fromVersion
    let currentPackageJson: any = {};
    try {
        const packageJsonPath = resolve(repoPath, 'package.json');
        if (existsSync(packageJsonPath)) {
            currentPackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        }
    } catch {
        // Ignore errors reading package.json for fromVersion lookup
    }

    const allDeps = {
        ...(currentPackageJson.dependencies || {}),
        ...(currentPackageJson.devDependencies || {}),
    };

    return deps.map((dep) => {
        // Check if :dev suffix
        let isDev = false;
        let depStr = dep;
        if (depStr.endsWith(':dev')) {
            isDev = true;
            depStr = depStr.slice(0, -4);
        }

        // Parse name@version - handle scoped packages like @angular/core@20.0.0
        const lastAtIdx = depStr.lastIndexOf('@');
        if (lastAtIdx <= 0) {
            console.warn(`Invalid dependency format: ${dep}. Expected name@version[:dev]`);
            return null;
        }

        const name = depStr.substring(0, lastAtIdx);
        const version = depStr.substring(lastAtIdx + 1);

        if (!name || !version) {
            console.warn(`Invalid dependency format: ${dep}. Expected name@version[:dev]`);
            return null;
        }

        // Auto-detect isDev from current package.json if not explicitly set
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
    }).filter(Boolean) as DependencyUpdate[];
}

program.parse();
