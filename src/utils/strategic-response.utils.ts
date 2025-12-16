import { StrategicResponse, ConflictAnalysis } from '@I/index';
import { createStrategicResponseRectificationPrompt } from './dumb-resolver-helper';
import { getOpenAIService } from '@/services/openai.service';
import { getPackageDependents } from './package-lock-parser.utils';
import { getPackageVersionData } from './package-registry.utils';
import { getLogger } from './logger.utils';

const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

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
