import { StrategicResponse, ConflictAnalysis } from '@I/index';
import { createStrategicResponseRectificationPrompt } from './dumb-resolver-helper';
import { getOpenAIService } from '@/services/openai.service';
import { getPackageDependents } from './package-lock-parser.utils';
const JSON_RESPONSE_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

export async function rectifyStrategicResponseWithDependentInfo(strategicResponse: StrategicResponse, conflictAnalysis: ConflictAnalysis): Promise<StrategicResponse> {
    // Get dependents for all packages mentioned in error
    const dependentsMap: Record<string, Array<{ name: string; version: string }>> = {};
    for (const pkg of conflictAnalysis.allPackagesMentionedInError) {
        const dependents = getPackageDependents(pkg.name);
        dependentsMap[pkg.name] = dependents || [];
    }

    const rectificationPrompt = createStrategicResponseRectificationPrompt(strategicResponse, conflictAnalysis, dependentsMap);
    const openai = getOpenAIService();
    const response = await openai.generateText(rectificationPrompt);
    let jsonString = response.trim();
    const jsonMatch = jsonString.match(JSON_RESPONSE_REGEX);
    if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
    }
    return JSON.parse(jsonString) as StrategicResponse;
}
