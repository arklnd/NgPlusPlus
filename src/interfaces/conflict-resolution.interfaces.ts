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

export interface ConflictAnalysis {
    conflictingPackage: string;
    conflictingPackageCurrentVersion: string;
    satisfyingPackages: PackageVersionInfo[];
    notSatisfying: PackageVersionInfo[];
    conflictingPackageAvailableVersions?: string[];
    rank?: number;
    tier?: string;
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
