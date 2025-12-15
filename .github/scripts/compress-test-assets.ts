import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';

const assetsPath = path.join(process.cwd(), 'test', 'assets');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const outputPath = path.join(process.cwd(), `test-assets-${timestamp}.zip`);

if (!fs.existsSync(assetsPath)) {
    console.error(`Assets directory not found: ${assetsPath}`);
    process.exit(1);
}

try {
    const zip = new AdmZip();
    zip.addLocalFolder(assetsPath, 'test/assets');
    zip.writeZip(outputPath);
    console.log(`Zip created successfully: ${outputPath}`);
} catch (error) {
    console.error('Error creating zip:', (error as Error).message);
    process.exit(1);
}
