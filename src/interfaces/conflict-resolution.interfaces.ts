import { isDevDependency } from '@U/index';
export interface ConflictInfo {
    packageName: string;
    currentVersion: string;
    conflictsWithPackageName: string;
    conflictsWithVersion: string;
    reason: string;
}

export interface ConflictResolution {
    conflicts: ConflictInfo[];
    resolutions: string[];
}

export interface PackageVersionInfo {
    packageName: string;
    packageVersion: string;
    requiredVersionRange: string;
    rank: number;
    tier?: string;
    availableVersions?: string[];
    isDevDependency: boolean;
}

export interface ConflictAnalysis {
    conflictingPackage: string;
    conflictingPackageCurrentVersion: string;
    satisfyingPackages: PackageVersionInfo[];
    notSatisfying: PackageVersionInfo[];
    conflictingPackageAvailableVersions?: string[];
    rank: number;
    tier: string;
    isDevDependency: boolean;
}

export interface PackageRank {
    name: string;
    rank: number;
}

export interface updateMade {
    package: PackageRank;
    fromVersion: string;
    toVersion: string;
    reason: PackageRank;
}

export interface ReasoningRecording {
    updateMade: updateMade[];
}

export interface UpdateSuggestion {
    name: string;
    version: string;
    isDev: boolean;
    reason: string;
    fromVersion: string;
}

export interface UpdateSuggestions {
    suggestions: UpdateSuggestion[];
    analysis: string;
    reasoning: ReasoningRecording;
}
