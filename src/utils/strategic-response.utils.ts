import { StrategicResponse, ConflictAnalysis } from '@I/index';
import { createStrategicResponseRectificationPrompt } from './dumb-resolver-helper';
import { getOpenAIService } from '@/services/openai.service';
import { getPackageDependents } from './package-lock-parser.utils';
import { getPackageVersionData } from './package-registry.utils';
const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

export async function rectifyStrategicResponseWithDependentInfo(strategicResponse: StrategicResponse, conflictAnalysis: ConflictAnalysis): Promise<StrategicResponse> {
    // Get dependents for all packages mentioned in error
    let suggestedAndRequiredVersions: Record<string, { suggestedVersion: string; requirements: Array<{ requiredVersion: string; requiredByDependentPack: string }> }> = {};
    for (const pkg of strategicResponse.suggestions) {
        suggestedAndRequiredVersions[pkg.name] = {
            suggestedVersion: pkg.version,
            requirements: [],
        };
        const dependents = getPackageDependents(pkg.name) ?? [];
        for (const dependent of dependents) {
            const versionData = await getPackageVersionData(dependent.name, dependent.version);
            if (versionData) {
                const allDependenciesOfDependent = { ...versionData.dependencies, ...versionData.devDependencies, ...versionData.peerDependencies };
                suggestedAndRequiredVersions[pkg.name].requirements.push({
                    requiredVersion: allDependenciesOfDependent[pkg.name],
                    requiredByDependentPack: `${dependent.name}@${dependent.version}`,
                });
            }
        }
    }

    const rectificationPrompt = createStrategicResponseRectificationPrompt(strategicResponse, conflictAnalysis, suggestedAndRequiredVersions);
    const openai = getOpenAIService();
    const response = await openai.generateText(rectificationPrompt);
    let jsonString = response.trim();
    const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
    if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
    }
    return JSON.parse(jsonString) as StrategicResponse;
}
