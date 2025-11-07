export interface StrategicSuggestion {
    name: string;
    version: string;
    isDev: boolean;
    reason: string;
    fromVersion: string;
}

export interface StrategicUpdateMade {
    package: {
        name: string;
        rank: string;
    };
    fromVersion: string;
    toVersion: string;
    reasoningComment: string;
    reason: {
        name: string;
        rank: string;
    };
}

export interface StrategicReasoning {
    updateMade: StrategicUpdateMade[];
}

export interface StrategicResponse {
    suggestions: StrategicSuggestion[];
    analysis: string;
    reasoning: StrategicReasoning;
}
