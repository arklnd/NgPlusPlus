import { expect } from 'chai';
import { updatePackageWithDependencies } from '../src/tools/dependency-resolver.tool.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

describe('Dependency Resolver with Version Validation', () => {
    let testRepoPath: string;
    let packageJsonPath: string;

    beforeEach(() => {
        // Create a temporary directory for each test
        testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-test-'));
        packageJsonPath = path.join(testRepoPath, 'package.json');
    });

    afterEach(() => {
        // Clean up the temporary directory
        if (fs.existsSync(packageJsonPath)) {
            fs.unlinkSync(packageJsonPath);
        }
        if (fs.existsSync(testRepoPath)) {
            fs.rmdirSync(testRepoPath);
        }
    });

    it('should reject non-existent package versions', async function () {
        // Increase timeout for npm operations
        this.timeout(60000); // 1 minute

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
                lodash: '^4.17.21',
            },
            devDependencies: {},
        };

        const plannedUpdates: PackageUpdate[] = [
            {
                name: 'lodash',
                version: '999.999.999',
                isDev: false,
            },
        ];

        // Create package.json file
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        try {
            await updatePackageWithDependencies(testRepoPath, false, plannedUpdates);
            expect.fail('Should have thrown an error for non-existent version');
        } catch (error) {
            expect(error).to.be.an('error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            expect(errorMessage).to.include('do not exist in the npm registry');
            expect(errorMessage).to.include('lodash@999.999.999');
        }
    });

    it('should proceed when all package versions exist', async function () {
        // Increase timeout for npm operations
        this.timeout(60000); // 1 minute

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
                lodash: '^4.17.20',
            },
            devDependencies: {},
        };

        const plannedUpdates: PackageUpdate[] = [
            {
                name: 'lodash',
                version: '4.17.21',
                isDev: false,
            },
        ];

        // Create package.json file
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // This should work without throwing an error
        const result = await updatePackageWithDependencies(testRepoPath, false, plannedUpdates);

        expect(result).to.be.a('string');
        expect(result).to.include('package versions validated successfully');
        expect(result).to.include('Updated lodash to 4.17.21');
        expect(result).to.include('package.json updated successfully');
    });

    it('should validate multiple packages with mixed existence', async function () {
        // Increase timeout for npm operations
        this.timeout(60000); // 1 minute

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
                lodash: '^4.17.21',
                express: '^4.18.0',
            },
            devDependencies: {},
        };

        const plannedUpdates: PackageUpdate[] = [
            {
                name: 'lodash',
                version: '4.17.21', // This exists
                isDev: false,
            },
            {
                name: 'express',
                version: '999.999.999', // This doesn't exist
                isDev: false,
            },
        ];

        // Create package.json file
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        try {
            await updatePackageWithDependencies(testRepoPath, false, plannedUpdates);
            expect.fail('Should have thrown an error for non-existent version');
        } catch (error) {
            expect(error).to.be.an('error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            expect(errorMessage).to.include('do not exist in the npm registry');
            expect(errorMessage).to.include('express@999.999.999');
            expect(errorMessage).to.not.include('lodash@4.17.21'); // Valid package should not be in error
        }
    });
});
