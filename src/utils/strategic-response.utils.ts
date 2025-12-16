import { StrategicResponse, ConflictAnalysis } from '@I/index';
import { createStrategicResponseRectificationPrompt } from './dumb-resolver-helper';
import { getOpenAIService } from '@/services/openai.service';
import { getPackageDependents } from './package-lock-parser.utils';
import { getPackageVersionData } from './package-registry.utils';
import { getLogger } from './logger.utils';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/**
 * Rectifies and enriches an AI-generated strategic response with dependency requirement data from dependent packages.
 * 
 * This function refines an initial AI-generated strategic response by enriching it with dependency requirement data from dependent packages.
 * 
 * WHAT IT DOES:
 * 
 * 1. Collects Dependent Information: For each package suggested in the strategic response, it finds all packages that 
 *    depend on it using getPackageDependents()
 * 
 * 2. Gathers Version Requirements: For each dependent package, it retrieves the actual version requirements it specifies 
 *    for the suggested package (from dependencies, devDependencies, and peerDependencies)
 * 
 * 3. Builds Enriched Context: Creates a suggestedAndRequiredVersions object that maps each suggested package to:
 *    - The suggested version
 *    - A list of all requirements from dependent packages (what version each dependent actually needs)
 * 
 * 4. Re-prompts OpenAI: Passes this enriched context to createStrategicResponseRectificationPrompt(), which creates a new 
 *    prompt that includes:
 *    - Original conflict analysis and suggestions
 *    - NEW: Actual version requirements from packages that depend on the suggested packages
 * 
 * 5. Returns Refined Response: Parses and returns the rectified strategic response from OpenAI
 * 
 * NEW DATA BEING USED:
 * 
 * The key new/enriched data introduced in this rectification step is:
 * - Dependent packages and their specific version requirements for each suggested package
 * - This allows the AI to validate/adjust suggestions against what's actually required downstream in the dependency tree, 
 *   rather than making suggestions in isolation
 * - The rectification ensures suggested versions don't break compatibility with other packages that depend on them
 * 
 * In essence, this is a feedback refinement loop that takes raw AI suggestions and validates/adjusts them against real 
 * dependency constraints discovered from the package lock file.
 * 
 * @param strategicResponse - Initial AI-generated suggestions for package versions
 * @param conflictAnalysis - Analysis of dependency conflicts from the project
 * @returns Promise<StrategicResponse> - Rectified strategic response validated against dependent package requirements
 */
export async function rectifyStrategicResponseWithDependentInfo(strategicResponse: StrategicResponse, conflictAnalysis: ConflictAnalysis): Promise<StrategicResponse> {
    const logger = getLogger().child('rectifyStrategicResponseWithDependentInfo');
    logger.info('Starting strategic response rectification', {
        suggestionsCount: strategicResponse.suggestions.length,
        conflictAnalysisPackages: conflictAnalysis.conflicts?.length ?? 0,
    });

    // Get dependents for all packages mentioned in error
    let suggestedAndRequiredVersions: Record<string, { suggestedVersion: string; requirements: Array<{ requiredVersion: string; requiredByDependentPack: string }> }> = {};
    for (const pkg of strategicResponse.suggestions) {
        logger.debug(`Processing package: ${pkg.name}@${pkg.version}`);

        suggestedAndRequiredVersions[pkg.name] = {
            suggestedVersion: pkg.version,
            requirements: [],
        };
        const dependents = getPackageDependents(pkg.name) ?? [];
        logger.trace(`Found ${dependents.length} dependents for ${pkg.name}`);

        for (const dependent of dependents) {
            const versionData = await getPackageVersionData(dependent.name, dependent.version);
            if (versionData) {
                const allDependenciesOfDependent = { ...versionData.dependencies, ...versionData.devDependencies, ...versionData.peerDependencies };
                suggestedAndRequiredVersions[pkg.name].requirements.push({
                    requiredVersion: allDependenciesOfDependent[pkg.name],
                    requiredByDependentPack: `${dependent.name}@${dependent.version}`,
                });
                logger.debug(`Added requirement from ${dependent.name}@${dependent.version}`);
            }
        }
    }

    logger.info('Creating rectification prompt', {
        totalPackagesAnalyzed: Object.keys(suggestedAndRequiredVersions).length,
    });

    const rectificationPrompt = createStrategicResponseRectificationPrompt(strategicResponse, conflictAnalysis, suggestedAndRequiredVersions);
    const openai = getOpenAIService();

    logger.info('Calling OpenAI service for response generation');
    const response = await openai.generateText(rectificationPrompt);

    let jsonString = response.trim();
    const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
    if (jsonMatch) {
        logger.debug('JSON response extracted from markdown code block');
        jsonString = jsonMatch[1].trim();
    }

    const rectifiedResponse = JSON.parse(jsonString) as StrategicResponse;
    logger.info('Strategic response rectified successfully', {
        suggestionsCount: rectifiedResponse.suggestions.length,
    });

    return rectifiedResponse;
}
