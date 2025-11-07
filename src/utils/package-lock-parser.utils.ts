import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';

export interface PackageInfo {
    name: string;
    version: string;
    dependents: Array<{ name: string; version: string }>;
}

export interface DependencyMapConfig {
    dbPath: string;
}

const DEFAULT_CONFIG: DependencyMapConfig = {
    dbPath: path.join(process.cwd(), 'dependency-map.db'),
};

/**
 * Utility class for parsing package-lock.json and storing dependency maps in SQLite
 */
export class DependencyMapParser {
    private static instance: DependencyMapParser | null = null;
    private db: Database.Database;
    private config: DependencyMapConfig;

    private constructor(config?: Partial<DependencyMapConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
        this.db = new Database(this.config.dbPath);
        this.initializeDatabase();
    }

    public static getInstance(config?: Partial<DependencyMapConfig>): DependencyMapParser {
        if (!DependencyMapParser.instance) {
            DependencyMapParser.instance = new DependencyMapParser(config);
        }
        return DependencyMapParser.instance;
    }

    private initializeDatabase(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS packages (
                name TEXT PRIMARY KEY,
                version TEXT NOT NULL,
                dependents TEXT NOT NULL
            );
        `);
    }

    /**
     * Parse package-lock.json and store dependency map in database
     */
    async parseAndStore(packageLockPath: string, packageJsonPath?: string): Promise<void> {
        const packageJson = packageJsonPath || path.join(path.dirname(packageLockPath), 'package.json');

        if (!fs.existsSync(packageJson)) {
            throw new Error('package.json not found in the same directory as package-lock.json');
        }

        if (!fs.existsSync(packageLockPath)) {
            throw new Error('package-lock.json not found');
        }

        // Read lockfile to check version
        const lockfileContent = fs.readFileSync(packageLockPath, 'utf-8');
        const lockfile = JSON.parse(lockfileContent);
        const lockfileVersion = lockfile.lockfileVersion;

        let packageMap: Map<string, PackageInfo>;

        if (lockfileVersion === 2) {
            packageMap = await this.parsePackageLockV2(packageJson, packageLockPath);
        } else if (lockfileVersion === 3) {
            packageMap = await this.parsePackageLockV3(packageJson, packageLockPath);
        } else {
            throw new Error(`Unsupported lockfile version: ${lockfileVersion}. Only v2 and v3 are supported.`);
        }

        // Store in database
        this.storePackageMap(packageMap);
    }

    private async parsePackageLockV2(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
        const depTree: PkgTree = await buildDepTreeFromFiles(
            path.dirname(lockFilePath),
            packageJsonPath,
            lockFilePath,
            true, // includeDev
            false // strictOutOfSync
        );

        const packageMap = new Map<string, PackageInfo>();
        this.traverseDependencies(depTree, packageMap);

        // For top-level dependencies, add the root package as a dependent
        if (depTree.dependencies) {
            for (const [depName] of Object.entries(depTree.dependencies)) {
                const pkg = packageMap.get(depName);
                if (pkg) {
                    const existingDependent = pkg.dependents.find((d) => d.name === depTree.name);
                    if (!existingDependent) {
                        pkg.dependents.push({
                            name: depTree.name || 'root',
                            version: depTree.version || '',
                        });
                    }
                }
            }
        }

        return packageMap;
    }

    private async parsePackageLockV3(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const lockfile = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));

        const rootName = packageJson.name;
        const rootVersion = packageJson.version;
        const packages = lockfile.packages;

        const packageMap = new Map<string, PackageInfo>();

        // Add all packages from lockfile
        for (const [pkgPath, pkgInfo] of Object.entries(packages as any)) {
            if (pkgPath === '') continue; // skip root
            const name = (pkgInfo as any).name || pkgPath.split('/').pop();
            const version = (pkgInfo as any).version || '';
            if (!packageMap.has(name)) {
                packageMap.set(name, {
                    name,
                    version,
                    dependents: [],
                });
            }
        }

        // Build dependents
        for (const [pkgPath, pkgInfo] of Object.entries(packages as any)) {
            const name = pkgPath === '' ? rootName : (pkgInfo as any).name || pkgPath.split('/').pop();
            const version = (pkgInfo as any).version || '';
            const deps = { ...((pkgInfo as any).dependencies || {}), ...((pkgInfo as any).devDependencies || {}) };
            for (const depName of Object.keys(deps)) {
                const pkg = packageMap.get(depName);
                if (pkg) {
                    const existing = pkg.dependents.find((d) => d.name === name);
                    if (!existing) {
                        pkg.dependents.push({
                            name,
                            version,
                        });
                    }
                }
            }
        }

        return packageMap;
    }

    private traverseDependencies(depTree: any, packageMap: Map<string, PackageInfo>, parentName?: string, parentVersion?: string): void {
        if (depTree.dependencies) {
            for (const [depName, depInfo] of Object.entries(depTree.dependencies)) {
                const dep = depInfo as any;

                if (!packageMap.has(depName)) {
                    packageMap.set(depName, {
                        name: depName,
                        version: dep.version || '',
                        dependents: [],
                    });
                }

                if (parentName) {
                    const pkg = packageMap.get(depName);
                    if (pkg) {
                        const existingDependent = pkg.dependents.find((d) => d.name === parentName);
                        if (!existingDependent) {
                            pkg.dependents.push({
                                name: parentName,
                                version: parentVersion || '',
                            });
                        }
                    }
                }

                this.traverseDependencies(dep, packageMap, depName, dep.version);
            }
        }
    }

    private storePackageMap(packageMap: Map<string, PackageInfo>): void {
        const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO packages (name, version, dependents)
            VALUES (?, ?, ?)
        `);

        for (const pkg of packageMap.values()) {
            insertStmt.run(pkg.name, pkg.version, JSON.stringify(pkg.dependents));
        }
    }

    /**
     * Get dependents for a specific package
     */
    getDependents(packageName: string): Array<{ name: string; version: string }> | null {
        const stmt = this.db.prepare('SELECT dependents FROM packages WHERE name = ?');
        const result = stmt.get(packageName) as { dependents: string } | undefined;

        if (result) {
            return JSON.parse(result.dependents);
        }

        return null;
    }

    /**
     * Get all packages in the dependency map
     */
    getAllPackages(): PackageInfo[] {
        const stmt = this.db.prepare('SELECT name, version, dependents FROM packages');
        const rows = stmt.all() as Array<{ name: string; version: string; dependents: string }>;

        return rows.map((row) => ({
            name: row.name,
            version: row.version,
            dependents: JSON.parse(row.dependents),
        }));
    }

    /**
     * Close the database connection
     */
    close(): void {
        this.db.close();
    }
}

/**
 * Convenience function to parse and store dependency map
 */
export async function parseAndStoreDependencyMap(packageLockPath: string, packageJsonPath?: string, dbPath?: string): Promise<DependencyMapParser> {
    const parser = DependencyMapParser.getInstance(dbPath ? { dbPath } : undefined);
    await parser.parseAndStore(packageLockPath, packageJsonPath);
    return parser;
}

/**
 * Convenience function to get dependents for a package
 */
export function getPackageDependents(packageName: string, dbPath?: string): Array<{ name: string; version: string }> | null {
    const parser = DependencyMapParser.getInstance(dbPath ? { dbPath } : undefined);
    const dependents = parser.getDependents(packageName);
    return dependents;
}
