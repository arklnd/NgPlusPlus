import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';
import { getLogger } from '@U/index';

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
    private logger = getLogger().child('DependencyMapParser');

    private constructor(config?: Partial<DependencyMapConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
        this.db = new Database(this.config.dbPath);
        this.logger.info('Initializing DependencyMapParser', { dbPath: this.config.dbPath });
        this.initializeDatabase();
    }

    public static getInstance(config?: Partial<DependencyMapConfig>): DependencyMapParser {
        if (!DependencyMapParser.instance) {
            DependencyMapParser.instance = new DependencyMapParser(config);
        }
        return DependencyMapParser.instance;
    }

    private initializeDatabase(): void {
        this.logger.debug('Initializing database schema');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS packages (
                name TEXT PRIMARY KEY,
                version TEXT NOT NULL,
                dependents TEXT NOT NULL
            );
        `);
        this.logger.info('Database schema initialized successfully');
    }

    /**
     * Parse package-lock.json and store dependency map in database
     */
    async parseAndStore(packageLockPath: string, packageJsonPath?: string): Promise<void> {
        const packageJson = packageJsonPath || path.join(path.dirname(packageLockPath), 'package.json');
        
        this.logger.info('Starting dependency map parsing', { 
            packageLockPath, 
            packageJsonPath: packageJson 
        });

        if (!fs.existsSync(packageJson)) {
            this.logger.error('package.json not found', { packageJsonPath: packageJson });
            throw new Error('package.json not found in the same directory as package-lock.json');
        }

        if (!fs.existsSync(packageLockPath)) {
            this.logger.error('package-lock.json not found', { packageLockPath });
            throw new Error('package-lock.json not found');
        }

        // Read lockfile to check version
        this.logger.debug('Reading package-lock.json file');
        const lockfileContent = fs.readFileSync(packageLockPath, 'utf-8');
        const lockfile = JSON.parse(lockfileContent);
        const lockfileVersion = lockfile.lockfileVersion;
        
        this.logger.info('Detected lockfile version', { version: lockfileVersion });

        let packageMap: Map<string, PackageInfo>;

        if (lockfileVersion === 2) {
            this.logger.debug('Parsing package-lock.json v2');
            packageMap = await this.parsePackageLockV2(packageJson, packageLockPath);
        } else if (lockfileVersion === 3) {
            this.logger.debug('Parsing package-lock.json v3');
            packageMap = await this.parsePackageLockV3(packageJson, packageLockPath);
        } else {
            this.logger.error('Unsupported lockfile version', { version: lockfileVersion });
            throw new Error(`Unsupported lockfile version: ${lockfileVersion}. Only v2 and v3 are supported.`);
        }

        // Store in database
        this.logger.info('Storing package map in database', { packageCount: packageMap.size });
        this.storePackageMap(packageMap);
        this.logger.info('Dependency map parsing and storage completed successfully');
    }

    private async parsePackageLockV2(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
        this.logger.debug('Building dependency tree using snyk-nodejs-lockfile-parser');
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
            const topLevelDeps = Object.keys(depTree.dependencies);
            this.logger.debug('Processing top-level dependencies', { count: topLevelDeps.length });
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

        this.logger.info('Package-lock.json v2 parsing completed', { packagesFound: packageMap.size });
        return packageMap;
    }

    private async parsePackageLockV3(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
        this.logger.debug('Reading package.json and package-lock.json for v3 parsing');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const lockfile = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));

        const rootName = packageJson.name;
        const rootVersion = packageJson.version;
        const packages = lockfile.packages;

        const packageMap = new Map<string, PackageInfo>();

        // Add all packages from lockfile
        const packageKeys = Object.keys(packages);
        this.logger.debug('Processing packages from lockfile', { packageCount: packageKeys.length });
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
        this.logger.debug('Building dependency relationships');
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

        this.logger.info('Package-lock.json v3 parsing completed', { packagesFound: packageMap.size });
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
                    this.logger.trace('Added new package to map', { name: depName, version: dep.version });
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
                            this.logger.trace('Added dependent relationship', { 
                                package: depName, 
                                dependent: parentName 
                            });
                        }
                    }
                }

                this.traverseDependencies(dep, packageMap, depName, dep.version);
            }
        }
    }

    private storePackageMap(packageMap: Map<string, PackageInfo>): void {
        this.logger.debug('Storing packages in database');
        const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO packages (name, version, dependents)
            VALUES (?, ?, ?)
        `);

        let storedCount = 0;
        for (const pkg of packageMap.values()) {
            insertStmt.run(pkg.name, pkg.version, JSON.stringify(pkg.dependents));
            storedCount++;
        }
        
        this.logger.info('Package map stored successfully', { packagesStored: storedCount });
    }

    /**
     * Get dependents for a specific package
     */
    getDependents(packageName: string): Array<{ name: string; version: string }> | null {
        this.logger.debug('Retrieving dependents for package', { packageName });
        const stmt = this.db.prepare('SELECT dependents FROM packages WHERE name = ?');
        const result = stmt.get(packageName) as { dependents: string } | undefined;

        if (result) {
            const dependents = JSON.parse(result.dependents);
            this.logger.debug('Dependents found', { packageName, dependentCount: dependents.length });
            return dependents;
        }

        this.logger.debug('No dependents found for package', { packageName });
        return null;
    }

    /**
     * Get all packages in the dependency map
     */
    getAllPackages(): PackageInfo[] {
        this.logger.debug('Retrieving all packages from database');
        const stmt = this.db.prepare('SELECT name, version, dependents FROM packages');
        const rows = stmt.all() as Array<{ name: string; version: string; dependents: string }>;

        const packages = rows.map((row) => ({
            name: row.name,
            version: row.version,
            dependents: JSON.parse(row.dependents),
        }));
        
        this.logger.debug('All packages retrieved', { packageCount: packages.length });
        return packages;
    }

    /**
     * Close the database connection
     */
    close(): void {
        this.logger.info('Closing database connection');
        this.db.close();
    }
}

/**
 * Convenience function to parse and store dependency map
 */
export async function parseAndStoreDependencyMap(packageLockPath: string, packageJsonPath?: string, dbPath?: string): Promise<DependencyMapParser> {
    const logger = getLogger().child('parseAndStoreDependencyMap');
    logger.info('Starting convenience function for parsing and storing dependency map', { packageLockPath, packageJsonPath, dbPath });
    
    const parser = DependencyMapParser.getInstance(dbPath ? { dbPath } : undefined);
    await parser.parseAndStore(packageLockPath, packageJsonPath);
    
    logger.info('Convenience function completed successfully');
    return parser;
}

/**
 * Convenience function to get dependents for a package
 */
export function getPackageDependents(packageName: string, dbPath?: string): Array<{ name: string; version: string }> | null {
    const logger = getLogger().child('getPackageDependents');
    logger.debug('Retrieving package dependents via convenience function', { packageName, dbPath });
    
    const parser = DependencyMapParser.getInstance(dbPath ? { dbPath } : undefined);
    const dependents = parser.getDependents(packageName);
    
    logger.debug('Package dependents retrieval completed', { packageName, found: dependents !== null });
    return dependents;
}
