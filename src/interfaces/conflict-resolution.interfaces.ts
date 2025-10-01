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
