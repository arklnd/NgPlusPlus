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
    rank?: number;
    tier?: string;
    availableVersions?: string[];
}

export interface RequiredBy {
    dependent: string;
    dependentVersion?: string;
    requiredRange: string;
    type: "dependency" | "peer";
    isSatisfied: boolean;
}

export interface ConflictDetail {
    packageName: string;
    currentVersion: string;
    requiredBy: RequiredBy[];
}

export interface ConflictAnalysis {
    conflicts: ConflictDetail[];
    allPackagesMentionedInError: PackageVersionRankRegistryData[];
}

export interface PackageVersionRankRegistryData {
    name: string;
    currentVersion: string;
    rank: number;
    tier: string;
    packagesVersionData: string[];
}

export interface PackageRank {
    name: string;
    rank: number;
}

export interface updateMade {
    package: PackageRank
    fromVersion: string;
    toVersion: string;
    reason: PackageRank;
    reasoningComment: string;
}

export interface ReasoningRecording {
    updateMade: updateMade[];
}
