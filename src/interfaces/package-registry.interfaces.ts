export interface RegistryData {
    _id: string;
    _rev: string;
    name: string;
    'dist-tags': {
        latest: string;
        [tag: string]: string;
    };
    versions: string[];
    time: Record<string, string>;
    maintainers: Array<{
        name?: string;
        email?: string;
    }>;
    description?: string;
    homepage?: string;
    keywords?: string[];
    author?: string | {
        name?: string;
        email?: string;
        url?: string;
    };
    bugs?: {
        url?: string;
        email?: string;
    };
    license?: string;
    readmeFilename?: string;
    repository?: {
        type?: string;
        url?: string;
        directory?: string;
    };
    users?: Record<string, boolean>;
    _contentLength?: number;
    version?: string;
    bin?: Record<string, string>;
    dist?: {
        integrity?: string;
        shasum?: string;
        tarball?: string;
        fileCount?: number;
        unpackedSize?: number;
        signatures?: Array<{
            keyid?: string;
            sig?: string;
        }>;
    };
    main?: string;
    _from?: string;
    volta?: {
        node?: string;
        npm?: string;
    };
    browser?: Record<string, string | boolean>;
    engines?: Record<string, string>;
    gitHead?: string;
    scripts?: Record<string, string>;
    typings?: string;
    _npmUser?: string;
    _resolved?: string;
    overrides?: Record<string, string>;
    _integrity?: string;
    _npmVersion?: string;
    directories?: Record<string, any>;
    _nodeVersion?: string;
    _hasShrinkwrap?: boolean;
    packageManager?: string;
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    bundledDependencies?: string[];
    _npmOperationalInternal?: Record<string, any>;
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
