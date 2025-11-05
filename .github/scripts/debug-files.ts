import fs from 'fs';
import path from 'path';

function formatDateIST(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    return formatter.format(date);
}

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 bytes';
    const units = ['bytes', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function printTable(data: any[], title?: string) {
    if (data.length === 0) return;
    if (title) console.log(`\n====== ${title.toUpperCase()} ======`);
    const keys = Object.keys(data[0]);
    const colWidths = keys.map(key => Math.max(key.length, ...data.map(row => String(row[key]).length)));
    const header = keys.map((key, i) => key.padEnd(colWidths[i])).join(' │ ');
    const headerLine = '│ ' + header + ' │';
    const topSeparator = '╭' + '─'.repeat(headerLine.length - 2) + '╮';
    const middleSeparator = '├' + '─'.repeat(headerLine.length - 2) + '┤';
    const bottomSeparator = '╰' + '─'.repeat(headerLine.length - 2) + '╯';
    console.log(topSeparator);
    console.log(headerLine);
    console.log(middleSeparator);
    data.forEach(row => {
        const line = '│ ' + keys.map((key, i) => String(row[key]).padEnd(colWidths[i])).join(' │ ') + ' │';
        console.log(line);
    });
    console.log(bottomSeparator);
}

const files: any[] = [];
fs.readdirSync('.').forEach((file) => {
    const stats = fs.statSync(file);
    const isDir = stats.isDirectory();
    const emoji = isDir ? '📁' : '📄';
    files.push({ Name: `${emoji} ${file}`, Size: isDir ? '' : formatSize(stats.size), Modified: formatDateIST(stats.mtime) });
});
files.sort((a, b) => {
    const aIsFolder = a.Name.startsWith('📁');
    const bIsFolder = b.Name.startsWith('📁');
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    return a.Name.localeCompare(b.Name);
});
printTable(files, 'Listing files and folders in current directory');

const cacheFiles: any[] = [];
if (fs.existsSync('package-cache.db')) {
    const stats = fs.statSync('package-cache.db');
    cacheFiles.push({ File: 'package-cache.db', Status: 'Found', Size: formatSize(stats.size), Modified: formatDateIST(stats.mtime) });
} else {
    cacheFiles.push({ File: 'package-cache.db', Status: 'NOT found in root', Size: 'N/A', Modified: 'N/A' });
}
printTable(cacheFiles, 'Checking for package-cache.db');

const utilsCache: any[] = [];
if (fs.existsSync('src/utils/package-cache.db')) {
    const stats = fs.statSync('src/utils/package-cache.db');
    utilsCache.push({ File: 'src/utils/package-cache.db', Status: 'Found', Size: formatSize(stats.size), Modified: formatDateIST(stats.mtime) });
} else {
    utilsCache.push({ File: 'src/utils/package-cache.db', Status: 'NOT found', Size: 'N/A', Modified: 'N/A' });
}
printTable(utilsCache, 'Checking for cache in src/utils');

const dbFiles: any[] = [];
function findDbFiles(dir: string): void {
    try {
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            const fullPath = path.join(dir, file);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    findDbFiles(fullPath);
                } else if (file.endsWith('.db')) {
                    dbFiles.push({ File: fullPath, Size: formatSize(stats.size), Modified: formatDateIST(stats.mtime) });
                }
            } catch (e) {
                // Ignore errors for individual files
            }
        });
    } catch (e) {
        // Ignore errors for directories
    }
}
findDbFiles('.');
printTable(dbFiles, 'Searching for *.db files');
const gitGitInfo: any[] = [];
if (fs.existsSync('test/assets/git-git')) {
    function countFiles(dir: string): number {
        let count = 0;
        try {
            const files = fs.readdirSync(dir);
            files.forEach((file) => {
                const fullPath = path.join(dir, file);
                try {
                    const stats = fs.statSync(fullPath);
                    if (stats.isDirectory()) {
                        count += countFiles(fullPath);
                    } else {
                        count++;
                    }
                } catch (e) {
                    // Ignore errors for individual files
                }
            });
        } catch (e) {
            // Ignore errors for directories
        }
        return count;
    }
    gitGitInfo.push({ Directory: 'test/assets/git-git', Status: 'Found', TotalFiles: countFiles('test/assets/git-git') });
} else {
    gitGitInfo.push({ Directory: 'test/assets/git-git', Status: 'NOT found', TotalFiles: 'N/A' });
}
printTable(gitGitInfo, 'Checking for git-git directory');

const assetsFiles: any[] = [];
if (fs.existsSync('test/assets')) {
    fs.readdirSync('test/assets').forEach((file) => {
        try {
            const stats = fs.statSync(path.join('test/assets', file));
            const isDir = stats.isDirectory();
            const emoji = isDir ? '📁' : '📄';
            assetsFiles.push({ Name: `${emoji} ${file}`, Size: isDir ? '' : formatSize(stats.size), Modified: formatDateIST(stats.mtime) });
        } catch (e) {
            // Ignore errors for individual files
        }
    });
    assetsFiles.sort((a, b) => {
        const aIsFolder = a.Name.startsWith('📁');
        const bIsFolder = b.Name.startsWith('📁');
        if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
        return a.Name.localeCompare(b.Name);
    });
}
printTable(assetsFiles, 'Listing test/assets contents');
