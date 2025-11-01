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
    allPackagesMentionedInError: string[];
    conflictingPackage: string;
    conflictingPackageCurrentVersion: string;
    satisfyingPackages: PackageVersionInfo[];
    notSatisfying: PackageVersionInfo[];
    conflictingPackageAvailableVersions?: string[];
    rank: number;
    tier: string;
    packagesVersionData: Map<string, string[]>;
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
}

export interface ReasoningRecording {
    updateMade: updateMade[];
}
