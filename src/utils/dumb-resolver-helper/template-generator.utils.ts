import Handlebars from 'handlebars';
import { ConflictAnalysis, ReasoningRecording, StrategicResponse } from '@I/index';

// Template imports - these are inlined as strings at build time by esbuild hbs-loader plugin.
// At typecheck time TypeScript doesn't know about .hbs modules, so we use require() which
// esbuild will resolve at bundle time, and for tsc --noEmit we declare the module below.
//
// When bundled by esbuild, each .hbs file is converted to: export default "<template string>"
// At dev time (tsx), we fall back to fs.readFileSync.

import systemPromptTpl from '../../templates/system-prompt.hbs';
import strategicPromptTpl from '../../templates/strategic-prompt.hbs';
import dependencyParsingPromptTpl from '../../templates/dependency-parsing-prompt.hbs';
import packageRankingPromptTpl from '../../templates/package-ranking-prompt.hbs';
import aiResponseFormatErrorTpl from '../../templates/ai-response-format-error.hbs';
import packageValidationErrorTpl from '../../templates/package-validation-error.hbs';
import noNewSuggestionErrorTpl from '../../templates/no-new-suggestion-error.hbs';
import strategicResponseRectificationTpl from '../../templates/strategic-response-rectification-prompt.hbs';

/**
 * Lazy-loaded compiled templates cache
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Template source map - maps template name to raw content (inlined by esbuild)
 */
const TEMPLATE_SOURCES: Record<string, string> = {
    'system-prompt': systemPromptTpl,
    'strategic-prompt': strategicPromptTpl,
    'dependency-parsing-prompt': dependencyParsingPromptTpl,
    'package-ranking-prompt': packageRankingPromptTpl,
    'ai-response-format-error': aiResponseFormatErrorTpl,
    'package-validation-error': packageValidationErrorTpl,
    'no-new-suggestion-error': noNewSuggestionErrorTpl,
    'strategic-response-rectification-prompt': strategicResponseRectificationTpl,
};

/**
 * Register custom Handlebars helpers
 */
function registerHelpers() {
    Handlebars.registerHelper('json', function(context) {
        return JSON.stringify(context, null, 2);
    });
}

// Register helpers on module load
registerHelpers();

/**
 * Load and compile a Handlebars template from inlined source
 */
function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
    if (templateCache.has(templateName)) {
        return templateCache.get(templateName)!;
    }

    const templateContent = TEMPLATE_SOURCES[templateName];
    if (!templateContent) {
        throw new Error(`Template not found: ${templateName}. Available: ${Object.keys(TEMPLATE_SOURCES).join(', ')}`);
    }

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

    let errorObject;
    try {
        errorObject = JSON.parse(installError);
    } catch {
        errorObject = null;
    }

    return template({
        installError,
        errorObject,
        hasStructuredError: errorObject !== null
    });
}

/**
 * Creates a ranking prompt for AI to analyze and rank a single package
 */
export function createPackageRankingPrompt(packageName: string, readme?: string, dependentsMap?: Record<string, Array<{ name: string; version: string }>>): string {
    const template = loadTemplate('package-ranking-prompt');
    const dependents = dependentsMap?.[packageName] || [];
    const dependentCount = dependents.length;
    return template({ packageName, readme, dependents, dependentCount, hasDependents: dependentCount > 0 });
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
export function createStrategicResponseRectificationPrompt(strategicResponse: StrategicResponse, conflictAnalysis: ConflictAnalysis, suggestedAndRequiredVersions: Record<string, { suggestedVersion: string; requirements: Array<{ requiredVersion: string; requiredByDependentPack: string }> }>): string {
    const template = loadTemplate('strategic-response-rectification-prompt');

    const allPackagesMap = conflictAnalysis.allPackagesMentionedInError.reduce((acc, pkg) => {
        acc[pkg.name] = pkg;
        return acc;
    }, {} as Record<string, any>);

    const templateData = {
        strategicResponse,
        conflictAnalysis,
        suggestedAndRequiredVersions,
        allPackagesMap,
    };

    return template(templateData);
}
