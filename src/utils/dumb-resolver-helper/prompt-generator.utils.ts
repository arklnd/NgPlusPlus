import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ResolverAnalysis } from './dependency-analyzer.utils';
import { fileURLToPath } from 'url';
import { ConflictAnalysis, ReasoningRecording } from '@I/index';

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
export function createStrategicPrompt(reasoningRecording: ReasoningRecording, errorOutput: string, analysis: ConflictAnalysis, targetPackages: string[], attempt: number, maxAttempts: number): string {
    const template = loadTemplate('strategic-prompt');

    // Format target packages
    const targetPackagesList = targetPackages.join(', ');

    // Prepare template data
    const templateData = {
        reasoningRecording: JSON.stringify(reasoningRecording, null, 2),
        attempt,
        maxAttempts,
        targetPackages: targetPackagesList,
        errorOutput,
        analysis: JSON.stringify(analysis, null, 2),
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
export function createDependencyParsingPrompt(errorOutput: string): string {
    const template = loadTemplate('dependency-parsing-prompt');
    return template({ errorOutput });
}
