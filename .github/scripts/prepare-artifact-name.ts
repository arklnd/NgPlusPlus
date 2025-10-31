import fs from 'fs';

const testPattern = process.argv[2];
const runNumber = process.argv[3];

if (!testPattern || !runNumber) {
    console.error('Usage: npx tsx prepare-artifact-name.ts <testPattern> <runNumber>');
    process.exit(1);
}

const cleanName = testPattern.replace(/\s/g, '_');
const artifactName = `${cleanName}__logs-${runNumber}`;

if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `name=${artifactName}\n`);
}

console.log('Generated artifact name:', artifactName);
