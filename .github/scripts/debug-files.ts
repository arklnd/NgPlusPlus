import fs from 'fs';
import path from 'path';

console.log('=== Listing files in current directory ===');
fs.readdirSync('.').forEach((file) => {
    const stats = fs.statSync(file);
    console.log(`${file} - ${stats.size} bytes - ${stats.mtime}`);
});

console.log('\n=== Checking for package-cache.db ===');
if (fs.existsSync('package-cache.db')) {
    const stats = fs.statSync('package-cache.db');
    console.log('✅ package-cache.db found');
    console.log(`Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
} else {
    console.log('❌ package-cache.db NOT found in root');
}

console.log('\n=== Checking for cache in src/utils ===');
if (fs.existsSync('src/utils/package-cache.db')) {
    const stats = fs.statSync('src/utils/package-cache.db');
    console.log('✅ Found in src/utils/');
    console.log(`Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
}

console.log('\n=== Searching for *.db files ===');
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
                    console.log(`${fullPath} - ${stats.size} bytes`);
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

console.log('\n=== Checking for git-git directory ===');
if (fs.existsSync('test/assets/git-git')) {
    console.log('✅ test/assets/git-git found');
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
    console.log(`Total files: ${countFiles('test/assets/git-git')}`);
} else {
    console.log('❌ test/assets/git-git NOT found');
}

console.log('\n=== Listing test/assets contents ===');
if (fs.existsSync('test/assets')) {
    fs.readdirSync('test/assets').forEach((file) => {
        try {
            const stats = fs.statSync(path.join('test/assets', file));
            console.log(`${file} - ${stats.size} bytes - ${stats.mtime}`);
        } catch (e) {
            // Ignore errors for individual files
        }
    });
}
