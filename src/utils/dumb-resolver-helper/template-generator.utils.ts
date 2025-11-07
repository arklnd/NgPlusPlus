import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ResolverAnalysis } from './dependency-analyzer.utils';
import { fileURLToPath } from 'url';
import { ConflictAnalysis, ReasoningRecording, StrategicResponse } from '@I/index';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Lazy-loaded compiled templates cache
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Load and compile a Handlebars template
 */
function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
    if (templateCache.has(templateName)) {
        return templateCache.get(templateName)!;
    }

    const templatePath = path.join(__dirname, '../../templates', `${templateName}.hbs`);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const compiledTemplate = Handlebars.compile(templateContent);

    templateCache.set(templateName, compiledTemplate);
    return compiledTemplate;
}

/**
 * Creates an enhanced system prompt for AI-driven dependency resolution
 */
export function createEnhancedSystemPrompt(): string {
    const template = loadTemplate('system-prompt');
    return template({});
}

/**
 * Creates a strategic prompt for AI analysis of dependency conflicts
 */
export function createStrategicPrompt(reasoningRecording: ReasoningRecording, errorOutput: string, analysis: ConflictAnalysis, targetPackages: string, attempt: number, maxAttempts: number): string {
    const template = loadTemplate('strategic-prompt');

    // Prepare template data
    const allPackagesMap = analysis.allPackagesMentionedInError.reduce((acc, pkg) => {
        acc[pkg.name] = pkg;
        return acc;
    }, {} as Record<string, any>);

    const templateData = {
        reasoningRecording,
        attempt,
        maxAttempts,
        targetPackages,
        errorOutput,
        analysis,
        allPackagesMap,
    };

    return template(templateData);
}

/**
 * Creates an AI response format error retry message
 */
export function createAIResponseFormatErrorMessage(errorMessage?: string): string {
    const template = loadTemplate('ai-response-format-error');
    return template({ errorMessage });
}

/**
 * Creates a package version validation error retry message
 */
export function createPackageValidationErrorMessage(errorMessage: string, additionalGuidance?: string): string {
    const template = loadTemplate('package-validation-error');
    return template({ errorMessage, additionalGuidance });
}

/**
 * Creates a parsing prompt for AI to extract dependency constraints from error output
 */
export function createDependencyParsingPrompt(installError: string): string {
    const template = loadTemplate('dependency-parsing-prompt');
    return template({ installError });
}

/**
 * Creates a ranking prompt for AI to analyze and rank a single package
 */
export function createPackageRankingPrompt(packageName: string, readme?: string): string {
    const template = loadTemplate('package-ranking-prompt');
    return template({ packageName, readme });
}

/**
 * Creates a no new suggestion error retry message
 */
export function createNoNewSuggestionErrorRetryMessage(errorMessage?: string): string {
    const template = loadTemplate('no-new-suggestion-error');
    return template({ errorMessage });
}

/**
 * Creates a strategic response rectification prompt
 */
export function createStrategicResponseRectificationPrompt(strategicResponse: StrategicResponse, conflictAnalysis: ConflictAnalysis, dependentsMap?: Record<string, Array<{ name: string; version: string }>>): string {
    const template = loadTemplate('strategic-response-rectification-prompt');
    return template({ strategicResponse, conflictAnalysis, dependentsMap });
}
