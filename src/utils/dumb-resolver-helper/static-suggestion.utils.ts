import { ConflictAnalysis, ReasoningRecording, UpdateSuggestions } from '@/interfaces';

export function generateStaticSuggestions(conflictAnalysis: ConflictAnalysis, reasoningRecording: ReasoningRecording): UpdateSuggestions {
    const suggestions: UpdateSuggestions = {
        suggestions: [
            {
                name: 'package-name',
                version: 'suggested-version',
                isDev: true,
                reason: 'strategic rationale for this upgrade',
                fromVersion: 'current-version',
            },
        ],
        analysis: 'strategic analysis of the conflict and resolution approach',
        reasoning: {
            updateMade: [
                {
                    package: {
                        name: 'package-being-upgraded',
                        rank: 200,
                    },
                    fromVersion: '1.0.0',
                    toVersion: '2.0.0',
                    reason: {
                        name: 'higher-ranked-package-causing-conflict',
                        rank: 800,
                    },
                },
            ],
        },
    };

    return suggestions;
}
