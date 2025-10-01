export interface RegistryData {
    versions: Record<
        string,
        {
            dependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
        }
    >;
    'dist-tags'?: {
        latest?: string;
        [tag: string]: string | undefined;
    };
}

export interface PackageVersionData {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    version: string;
    name: string;
}

export interface ValidationResult {
    packageName: string;
    version: string;
    exists: boolean;
    error?: string;
}
