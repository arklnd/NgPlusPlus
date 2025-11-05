import AdmZip from 'adm-zip';

const zipPath: string = process.argv[2];

if (!zipPath) {
    console.error('Usage: tsx import-github.ts <path-to-zip>');
    process.exit(1);
}

try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo('.', true);
    console.log('Zip extracted successfully to repository root.');
} catch (error) {
    console.error('Error extracting zip:', (error as Error).message);
    process.exit(1);
}
