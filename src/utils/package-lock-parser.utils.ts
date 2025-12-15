import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import Arborist from '@npmcli/arborist';
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
    private static instances: Map<string, DependencyMapParser> = new Map();
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
        const fullConfig = { ...DEFAULT_CONFIG, ...(config || {}) };
        const key = fullConfig.dbPath;
        if (!DependencyMapParser.instances.has(key)) {
            DependencyMapParser.instances.set(key, new DependencyMapParser(fullConfig));
        }
        return DependencyMapParser.instances.get(key)!;
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

        // Parse using Arborist
        this.logger.debug('Parsing package-lock.json using Arborist');
        const packageMap = await this.parseWithArborist(path.dirname(packageLockPath));

        // Store in database
        this.logger.info('Storing package map in database', { packageCount: packageMap.size });
        this.storePackageMap(packageMap);
        this.logger.info('Dependency map parsing and storage completed successfully');
    }

    private async parseWithArborist(rootPath: string): Promise<Map<string, PackageInfo>> {
        this.logger.debug('Building dependency tree using @npmcli/arborist');
        const arb = new Arborist({ path: rootPath });
        const root = await arb.loadVirtual();
        const rootName = root.package?.name || ''; // from package-lock/package.json

        const packageMap = new Map<string, PackageInfo>();
        const seen = new Set<any>();
        const stack = [root];

        while (stack.length > 0) {
            const node = stack.pop()!;
            if (seen.has(node)) continue;
            seen.add(node);

            const name = node.isRoot ? rootName : node.name;
            const version = node.version || '';

            if (name) {
                if (!packageMap.has(name)) {
                    packageMap.set(name, {
                        name,
                        version,
                        dependents: [],
                    });
                }

                // Add dependents from incoming edges
                for (const edge of node.edgesIn) {
                    const from = edge.from;
                    if (from && from.name) {
                        const depPkg = packageMap.get(name)!;
                        const existing = depPkg.dependents.find(d => d.name === from.name && d.version === (from.version || ''));
                        if (!existing) {
                            depPkg.dependents.push({
                                name: from.isRoot ? rootName : from.name,
                                version: from.version || '',
                            });
                        }
                    }
                }
            }

            // Traverse children
            for (const child of node.children.values()) {
                stack.push(child);
            }
        }

        this.logger.info('Package-lock.json parsing completed using Arborist', { packagesFound: packageMap.size });
        return packageMap;
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
        DependencyMapParser.instances.delete(this.config.dbPath);
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
