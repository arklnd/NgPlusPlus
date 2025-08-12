import Database from 'better-sqlite3';
import * as path from 'path';
import { getLogger } from './logger.utils.js';
import { fileURLToPath } from 'url';

// Initialize logger once at module level
const logger = getLogger().child('Cache');

// Database instance - initialized once
let db: Database.Database | null = null;
let isInitialized = false;

/**
 * Initialize the SQLite database for package data caching (called once)
 */
function initializeDatabase(): Database.Database {
    if (db && isInitialized) {
        return db;
    }
    
    try {
        // Create database in the build directory
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const dbPath = path.join(__dirname, '../../package-cache.db');
        db = new Database(dbPath);
        
        // Create the package_cache table if it doesn't exist (only once)
        db.exec(`
            CREATE TABLE IF NOT EXISTS package_cache (
                name TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                cached_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_expires_at ON package_cache(expires_at);
        `);
        
        isInitialized = true;
        logger.debug('Cache database initialized', { dbPath });
        return db;
    } catch (error) {
        logger.error('Failed to initialize cache database', { 
            error: error instanceof Error ? error.message : String(error) 
        });
        throw error;
    }
}

/**
 * Get the database instance, initializing if necessary
 */
function getDatabase(): Database.Database {
    if (!db || !isInitialized) {
        return initializeDatabase();
    }
    return db;
}

/**
 * Get cached package data if it exists and hasn't expired
 */
export function getCachedPackageData(packageName: string): any | null {
    try {
        const database = getDatabase();
        const stmt = database.prepare('SELECT data FROM package_cache WHERE name = ? AND expires_at > ?');
        const now = Date.now();
        const result = stmt.get(packageName, now) as { data: string } | undefined;
        
        if (result) {
            return JSON.parse(result.data);
        }
        
        return null;
    } catch (error) {
        logger.error('Failed to get cached package data', { 
            package: packageName,
            error: error instanceof Error ? error.message : String(error) 
        });
        return null;
    }
}

/**
 * Cache package data with TTL
 */
export function setCachedPackageData(packageName: string, data: any, ttlMinutes: number = 60): void {
    try {
        const database = getDatabase();
        const now = Date.now();
        const expiresAt = now + (ttlMinutes * 60 * 1000);
        
        const stmt = database.prepare(`
            INSERT OR REPLACE INTO package_cache (name, data, cached_at, expires_at)
            VALUES (?, ?, ?, ?)
        `);
        
        stmt.run(packageName, JSON.stringify(data), now, expiresAt);
        
        logger.debug('Package data cached', { 
            package: packageName,
            ttlMinutes
        });
    } catch (error) {
        logger.error('Failed to cache package data', { 
            package: packageName,
            error: error instanceof Error ? error.message : String(error) 
        });
        // Don't throw - caching failure shouldn't break the main functionality
    }
}

/**
 * Clean up expired cache entries (called periodically)
 */
export function cleanExpiredCache(): void {
    try {
        const database = getDatabase();
        const stmt = database.prepare('DELETE FROM package_cache WHERE expires_at <= ?');
        const result = stmt.run(Date.now());
        
        if (result.changes > 0) {
            logger.debug('Cleaned expired cache entries', { 
                deletedCount: result.changes 
            });
        }
    } catch (error) {
        logger.error('Failed to clean expired cache', { 
            error: error instanceof Error ? error.message : String(error) 
        });
    }
}
