import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { updatePackageWithDependencies } from '@T/dependency-resolver.tool';
import { installDependencies } from '@U/index';
import { PackageJson } from '@I/index';

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

describe('updatePackageWithDependencies', function () {
    let tempDir: string;
    let testRepoPath: string;

    beforeEach(function () {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-test-'));
        testRepoPath = tempDir;
    });

    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should update HYUI9 Angular dependencies to version 20.0.0', async function () {
        // Increase timeout for npm operations
        this.timeout(3600000); // 60 minutes

        // Arrange - Copy asset files to test directory
        const assetsDir = path.join(__dirname, 'assets');
        const sourcePackageJsonPath = path.join(assetsDir, 'package_hyui9.json');
        const sourcePackageLockPath = path.join(assetsDir, 'package-lock_hyui9.json');

        const targetPackageJsonPath = path.join(testRepoPath, 'package.json');
        const targetPackageLockPath = path.join(testRepoPath, 'package-lock.json');

        // Copy the asset files to test directory
        fs.copyFileSync(sourcePackageJsonPath, targetPackageJsonPath);
        fs.copyFileSync(sourcePackageLockPath, targetPackageLockPath);

        // Read the actual package.json from assets
        const packageJson: PackageJson = JSON.parse(fs.readFileSync(sourcePackageJsonPath, 'utf8'));

        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/animations',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/common',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/compiler',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/core',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/forms',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser-dynamic',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/router',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cdk',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/material',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/compiler-cli',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/build-angular',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/architect',
                version: '^0.2000.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/core',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/elements',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/language-service',
                version: '^20.0.0',
                isDev: true,
            },
        ];

        // Act
        const result = await updatePackageWithDependencies(testRepoPath, false, plannedUpdates);

        // Create artifacts directory if it doesn't exist
        // const artifactsDir = path.join(__dirname, 'artifacts');
        // if (!fs.existsSync(artifactsDir)) {
        //     fs.mkdirSync(artifactsDir, { recursive: true });
        // }

        // copy package.json to src/test/artifacts/ for inspection
        // fs.copyFileSync(targetPackageJsonPath, path.join(__dirname, 'artifacts', 'package_hyui9_updated.json'));
        // fs.copyFileSync(targetPackageLockPath, path.join(__dirname, 'artifacts', 'package-lock_hyui9_updated.json'));
        fs.copyFileSync(targetPackageJsonPath, sourcePackageJsonPath);
        fs.copyFileSync(targetPackageLockPath, sourcePackageLockPath);
        // Assert
        expect(result).to.be.a('string');
        expect(result).to.include('✅ package.json updated successfully');

        // Verify the package.json was updated correctly
        const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        // Check production dependencies
        expect(updatedPackageJson.dependencies).to.have.property('@angular/animations', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/common', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/compiler', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser-dynamic', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/router', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/cdk', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/material', '^20.0.0');

        // Check development dependencies
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/build-angular', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/architect', '^0.2000.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/elements', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/language-service', '^20.0.0');
    });

    it('should update HYUI9 Angular dependencies to version 20 and install', async function () {
        // Increase timeout for npm operations
        this.timeout(3600000); // 60 minutes

        // Arrange - Copy asset files to test directory
        const assetsDir = path.join(__dirname, 'assets');
        const sourcePackageJsonPath = path.join(assetsDir, 'package_hyui9.json');
        const sourcePackageLockPath = path.join(assetsDir, 'package-lock_hyui9.json');

        const targetPackageJsonPath = path.join(testRepoPath, 'package.json');
        const targetPackageLockPath = path.join(testRepoPath, 'package-lock.json');

        // Copy the asset files to test directory
        fs.copyFileSync(sourcePackageJsonPath, targetPackageJsonPath);
        fs.copyFileSync(sourcePackageLockPath, targetPackageLockPath);

        // Read the actual package.json from assets
        const packageJson: PackageJson = JSON.parse(fs.readFileSync(sourcePackageJsonPath, 'utf8'));

        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/animations',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/common',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/compiler',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/core',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/forms',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser-dynamic',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/router',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cdk',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/material',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/compiler-cli',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/build-angular',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/architect',
                version: '^0.2000.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/core',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/elements',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/language-service',
                version: '^20.0.0',
                isDev: true,
            },
        ];

        // Act
        const result = await updatePackageWithDependencies(testRepoPath, false, plannedUpdates);
        await installDependencies(testRepoPath);

        // Create artifacts directory if it doesn't exist
        // const artifactsDir = path.join(__dirname, 'artifacts');
        // if (!fs.existsSync(artifactsDir)) {
        //     fs.mkdirSync(artifactsDir, { recursive: true });
        // }

        // copy package.json to src/test/artifacts/ for inspection
        // fs.copyFileSync(targetPackageJsonPath, path.join(__dirname, 'artifacts', 'package_hyui9_updated.json'));
        // fs.copyFileSync(targetPackageLockPath, path.join(__dirname, 'artifacts', 'package-lock_hyui9_updated.json'));
        fs.copyFileSync(targetPackageJsonPath, sourcePackageJsonPath);
        fs.copyFileSync(targetPackageLockPath, sourcePackageLockPath);
        // Assert
        expect(result).to.be.a('string');
        expect(result).to.include('✅ package.json updated successfully');

        // Verify the package.json was updated correctly
        const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        // Check production dependencies
        expect(updatedPackageJson.dependencies).to.have.property('@angular/animations', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/common', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/compiler', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser-dynamic', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/router', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/cdk', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/material', '^20.0.0');

        // Check development dependencies
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/build-angular', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/architect', '^0.2000.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/elements', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/language-service', '^20.0.0');
    });

    it('should handle empty package.json', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/core',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^20.0.0',
                isDev: true,
            },
        ];

        // Act
        const result = await updatePackageWithDependencies(testRepoPath, true, plannedUpdates);

        // Assert
        expect(result).to.include('✅ package.json updated successfully');

        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
    });

    it('should count update operations correctly', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/animations',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/common',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^20.0.0',
                isDev: true,
            },
        ];

        // Act
        const result = await updatePackageWithDependencies(testRepoPath, true, plannedUpdates);

        // Assert
        const lines = result.split('\n');
        const updateLines = lines.filter((line) => line.startsWith('✓ Updated'));
        expect(updateLines).to.have.length(3);

        expect(result).to.include('✓ Updated @angular/animations to ^20.0.0 (dependencies)');
        expect(result).to.include('✓ Updated @angular/common to ^20.0.0 (dependencies)');
        expect(result).to.include('✓ Updated @angular/cli to ^20.0.0 (devDependencies)');
    });

    it('should properly categorize dev and production dependencies', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/core',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/forms',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^20.0.0',
                isDev: true,
            },
            {
                name: '@angular/compiler-cli',
                version: '^20.0.0',
                isDev: true,
            },
        ];

        // Act
        const result = await updatePackageWithDependencies(testRepoPath, true, plannedUpdates);

        // Assert
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        // Production dependencies
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.not.have.property('@angular/cli');
        expect(updatedPackageJson.dependencies).to.not.have.property('@angular/compiler-cli');

        // Development dependencies
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.not.have.property('@angular/core');
        expect(updatedPackageJson.devDependencies).to.not.have.property('@angular/forms');
    });
});
