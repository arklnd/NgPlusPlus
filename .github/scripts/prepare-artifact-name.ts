import fs from 'fs';

const testPattern = process.argv[2];
const runNumber = process.argv[3];
const maxAttempts = process.argv[4];
const runAttempt = process.argv[5];

if (!testPattern || !runNumber) {
    console.error('Usage: npx tsx prepare-artifact-name.ts <testPattern> <runNumber> <maxAttempts> <runAttempt>');
    process.exit(1);
}

const cleanName = testPattern.replace(/\s/g, '_');
let artifactName = `${cleanName}__logs-${runNumber}`;

if (maxAttempts) {
    artifactName += `__MaxRetry-${maxAttempts}`;
}

if (runAttempt && runAttempt !== '1') {
    artifactName += `__PipelineRetry-${runAttempt}`;
}

if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `name=${artifactName}\n`);
}

console.log('Generated artifact name:', artifactName);
