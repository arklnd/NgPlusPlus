import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';

const assetsPath = path.join(process.cwd(), 'test', 'assets');
const logsPath = path.join(process.cwd(), 'src', 'utils', 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const outputPath = path.join(process.cwd(), `test-assets-${timestamp}.zip`);

if (!fs.existsSync(assetsPath)) {
    console.error(`Assets directory not found: ${assetsPath}`);
    process.exit(1);
}

// Find the latest .log file
let latestLogFile: string | null = null;
let latestTime = 0;

if (fs.existsSync(logsPath)) {
    const files = fs.readdirSync(logsPath);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    if (logFiles.length > 0) {
        for (const file of logFiles) {
            const filePath = path.join(logsPath, file);
            const stats = fs.statSync(filePath);
            if (stats.mtimeMs > latestTime) {
                latestTime = stats.mtimeMs;
                latestLogFile = filePath;
            }
        }
    }
}

try {
    const zip = new AdmZip();
    zip.addLocalFolder(assetsPath, 'test/assets');
    
    if (latestLogFile) {
        const fileName = path.basename(latestLogFile);
        const zipPath = path.relative(process.cwd(), latestLogFile).replace(/\\/g, '/');
        zip.addFile(zipPath, fs.readFileSync(latestLogFile));
        console.log(`Added latest log file: ${zipPath}`);
    } else {
        console.warn('No .log files found in src/utils/logs');
    }
    
    // Add database files
    const dbFiles = [
        'package-cache.db',
        'dependency-map.db',
        'test/test-dependency-map.db'
    ];
    
    for (const dbFile of dbFiles) {
        const filePath = path.join(process.cwd(), dbFile);
        if (fs.existsSync(filePath)) {
            const zipPath = dbFile.replace(/\\/g, '/');
            zip.addFile(zipPath, fs.readFileSync(filePath));
            console.log(`Added database file: ${zipPath}`);
        } else {
            console.warn(`Database file not found: ${dbFile}`);
        }
    }
    
    zip.writeZip(outputPath);
    console.log(`Zip created successfully: ${outputPath}`);
} catch (error) {
    console.error('Error creating zip:', (error as Error).message);
    process.exit(1);
}
