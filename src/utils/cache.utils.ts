import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLogger, ChildLogger } from '@U/logger.utils';
import { getCallerDetails } from '@U/index';

/**
 * Cache configuration interface
 */
export interface CacheConfig {
    /** Relative (to this file) or absolute directory where the DB file is stored */
    directory: string;
    /** Database filename */
    fileName: string;
    /** Default TTL in minutes for set operations when not explicitly passed */
    defaultTtlMinutes: number;
    /** Enable/disable caching globally (read operations will still attempt fetch) */
    enabled: boolean;
    /** Whether to log debug messages */
    verbose: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
    directory: '../../',
    fileName: 'package-cache.db',
    defaultTtlMinutes: 6000,
    enabled: true,
    verbose: true,
};

/**
 * OOP Cache class (singleton) wrapping SQLite persistence.
 * Pattern & ergonomics inspired by Logger implementation.
 */
export class Cache {
    private static instance: Cache | null = null;
    private db: Database.Database | null = null;
    private initialized = false;
    private logger: ChildLogger;
    private config: CacheConfig;

    private constructor(config?: Partial<CacheConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
        const caller = getCallerDetails();
        this.logger = getLogger().child(`${'Cache'} ${caller?.fileName}:${caller?.lineNumber}`);
    }

    /** Get singleton instance */
    static getInstance(config?: Partial<CacheConfig>): Cache {
        if (!Cache.instance) {
            Cache.instance = new Cache(config);
        } else if (config) {
            // Allow runtime config updates (merge)
            Cache.instance.config = { ...Cache.instance.config, ...config };
        }
        return Cache.instance;
    }

    /** Direct access to current configuration */
    getConfig(): CacheConfig {
        return { ...this.config };
    }

    /** Force re-initialization (mainly for tests) */
    reinitialize(): void {
        this.initialized = false;
        this.db = null;
        this.initializeDatabase();
    }

    /** Core DB init */
    private initializeDatabase(): Database.Database {
        if (this.db && this.initialized) return this.db;

        try {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const dbPath = path.isAbsolute(this.config.directory)
                ? path.join(this.config.directory, this.config.fileName)
                : path.join(__dirname, this.config.directory, this.config.fileName);

            this.db = new Database(dbPath);
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS package_cache (
                    name TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    cached_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_expires_at ON package_cache(expires_at);
            `);
            this.initialized = true;
            if (this.config.verbose) this.logger.debug('Cache database initialized', { dbPath });
            return this.db;
        } catch (error) {
            this.logger.error('Failed to initialize cache database', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /** Acquire DB handle */
    private getDatabase(): Database.Database {
        if (!this.db || !this.initialized) return this.initializeDatabase();
        return this.db;
    }

    /** Retrieve cached value if not expired */
    get<T = any>(key: string): T | null {
        if (!this.config.enabled) return null;
        try {
            const database = this.getDatabase();
            const stmt = database.prepare('SELECT data FROM package_cache WHERE name = ? AND expires_at > ?');
            const result = stmt.get(key, Date.now()) as { data: string } | undefined;
            if (result) return JSON.parse(result.data) as T;
            return null;
        } catch (error) {
            this.logger.error('Failed to get cached package data', {
                package: key,
                error: error instanceof Error ? error.message : String(error),
            });
            return null; // Non-fatal
        }
    }

    /** Store value with TTL (minutes) */
    set(key: string, value: any, ttlMinutes?: number): void {
        if (!this.config.enabled) return;
        try {
            const database = this.getDatabase();
            const now = Date.now();
            const ttl = (ttlMinutes ?? this.config.defaultTtlMinutes) * 60 * 1000;
            const expiresAt = now + ttl;
            const stmt = database.prepare(`
                INSERT OR REPLACE INTO package_cache (name, data, cached_at, expires_at)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(key, JSON.stringify(value), now, expiresAt);
            if (this.config.verbose) this.logger.debug('Package data cached', { package: key, ttlMinutes: ttlMinutes ?? this.config.defaultTtlMinutes });
        } catch (error) {
            this.logger.error('Failed to cache package data', {
                package: key,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** Delete expired entries */
    clean(): number {
        if (!this.config.enabled) return 0;
        try {
            const database = this.getDatabase();
            const stmt = database.prepare('DELETE FROM package_cache WHERE expires_at <= ?');
            const result = stmt.run(Date.now());
            if (result.changes > 0 && this.config.verbose) {
                this.logger.debug('Cleaned expired cache entries', { deletedCount: result.changes });
            }
            return result.changes;
        } catch (error) {
            this.logger.error('Failed to clean expired cache', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }

    /** Remove a specific key */
    delete(key: string): boolean {
        if (!this.config.enabled) return false;
        try {
            const database = this.getDatabase();
            const stmt = database.prepare('DELETE FROM package_cache WHERE name = ?');
            const result = stmt.run(key);
            return result.changes > 0;
        } catch (error) {
            this.logger.error('Failed to delete cache key', {
                package: key,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /** Flush everything */
    clearAll(): number {
        if (!this.config.enabled) return 0;
        try {
            const database = this.getDatabase();
            const result = database.prepare('DELETE FROM package_cache').run();
            if (this.config.verbose) this.logger.debug('Cleared entire cache', { deletedCount: result.changes });
            return result.changes;
        } catch (error) {
            this.logger.error('Failed to clear cache', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
}

// Singleton helpers (backward compatible function exports)
const cacheSingleton = () => Cache.getInstance();

/** Get cached package data if it exists and hasn't expired */
export function getCachedPackageData(packageName: string): any | null {
    return cacheSingleton().get(packageName);
}

/** Cache package data with TTL */
export function setCachedPackageData(packageName: string, data: any, ttlMinutes: number = cacheSingleton().getConfig().defaultTtlMinutes): void {
    cacheSingleton().set(packageName, data, ttlMinutes);
}

/** Clean up expired cache entries */
export function cleanExpiredCache(): void {
    cacheSingleton().clean();
}

/** Additional new exports for advanced usage */
export function getCacheInstance(config?: Partial<CacheConfig>): Cache {
    return Cache.getInstance(config);
}
