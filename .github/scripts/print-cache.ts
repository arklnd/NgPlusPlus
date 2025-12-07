import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database is located in the project root
const dbPath = path.join(__dirname, '../../', 'package-cache.db');

// Check if database file exists before proceeding
if (!fs.existsSync(dbPath)) {
    console.warn('Database file does not exist:', dbPath);
    process.exit(0);
}

const db = new Database(dbPath);

try {
    const stmt = db.prepare('SELECT name, data, cached_at, expires_at FROM package_cache');
    const rows = (stmt.all() as { name: string; data: string; cached_at: string; expires_at: string }[]).map((row) => ({
        ...row,
        data: row.data.substring(0, 100) + (row.data.length > 100 ? '...' : ''),
    }));
    console.table(rows);
} catch (error) {
    console.error('Error querying database:', error);
} finally {
    db.close();
}
