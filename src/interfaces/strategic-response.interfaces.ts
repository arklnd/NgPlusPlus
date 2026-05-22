import { ReasoningRecording } from "@I/conflict-resolution.interfaces";

export interface StrategicSuggestion {
    name: string;
    version: string;
    isDev: boolean;
    reason: string;
    fromVersion: string;
}

export interface StrategicResponse {
    suggestions: StrategicSuggestion[];
    analysis: string;
    reasoning: ReasoningRecording;
}
