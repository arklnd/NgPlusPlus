import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as semver from 'semver';
import { updatePackageWithDependencies } from '@T/dependency-resolver.tool';
import { dumbResolverHandler } from '@T/dumb-resolver.tool';
import { installDependencies } from '@U/index';
import { PackageJson } from '@I/index';

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

describe('updatePackageWithDependencies', function () {
    let testRepoPath: string;

    beforeEach(function () {
        // Create a temporary directory for testing
        testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-test-'));
    });

    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(testRepoPath)) {
            fs.rmSync(testRepoPath, { recursive: true, force: true });
        }
    });

    it('should update HYUI9 Angular dependencies to version 20.0.0', async function () {
        // Increase timeout for npm operations

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
        expect(typeof result).toBe('string');
        expect(result).toContain('✅ package.json updated successfully');

        // Verify the package.json was updated correctly
        const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        // Check production dependencies
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/animations', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/common', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/compiler', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/platform-browser', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/platform-browser-dynamic', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/router', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/cdk', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/material', '^20.0.0');

        // Check development dependencies
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/build-angular', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/architect', '^0.2000.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/elements', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/language-service', '^20.0.0');
    });

    it('should update HYUI9 Angular dependencies to version 20 and install', async function () {
        // Increase timeout for npm operations

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
        expect(typeof result).toBe('string');
        expect(result).toContain('✅ package.json updated successfully');

        // Verify the package.json was updated correctly
        const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        // Check production dependencies
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/animations', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/common', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/compiler', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/platform-browser', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/platform-browser-dynamic', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/router', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/cdk', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/material', '^20.0.0');

        // Check development dependencies
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/build-angular', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/architect', '^0.2000.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular-devkit/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/elements', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/language-service', '^20.0.0');
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
        expect(result).toContain('✅ package.json updated successfully');

        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli', '^20.0.0');
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
        expect(updateLines).toHaveLength(3);

        expect(result).toContain('✓ Updated @angular/animations to ^20.0.0 (dependencies)');
        expect(result).toContain('✓ Updated @angular/common to ^20.0.0 (dependencies)');
        expect(result).toContain('✓ Updated @angular/cli to ^20.0.0 (devDependencies)');
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
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).toHaveProperty('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).not.toHaveProperty('@angular/cli');
        expect(updatedPackageJson.dependencies).not.toHaveProperty('@angular/compiler-cli');

        // Development dependencies
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).not.toHaveProperty('@angular/core');
        expect(updatedPackageJson.devDependencies).not.toHaveProperty('@angular/forms');
    });

    it('should invoke dumbResolverHandler with HYUI9 Angular dependencies', async function () {
        // Increase timeout for npm operations

        // Arrange - Copy asset files to test directory
        const assetsDir = path.join(__dirname, 'assets');
        const sourcePackageJsonPath = path.join(assetsDir, 'package_hyui9.json');
        const sourcePackageLockPath = path.join(assetsDir, 'package-lock_hyui9.json');

        const targetPackageJsonPath = path.join(testRepoPath, 'package.json');
        const targetPackageLockPath = path.join(testRepoPath, 'package-lock.json');

        // Copy the asset files to test directory
        fs.copyFileSync(sourcePackageJsonPath, targetPackageJsonPath);
        fs.copyFileSync(sourcePackageLockPath, targetPackageLockPath);

        // Prepare input data for dumbResolverHandler using same dependencies as selected test
        const updateDependencies = [
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

        const dumbResolverInput = {
            repo_path: testRepoPath,
            update_dependencies: updateDependencies,
            maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '200', 10),
        };

        // Act - Invoke dumbResolverHandler
        const result = await dumbResolverHandler(dumbResolverInput);

        fs.copyFileSync(targetPackageJsonPath, sourcePackageJsonPath);
        fs.copyFileSync(targetPackageLockPath, sourcePackageLockPath);

        // Assert
        expect(result).toBeInstanceOf(Object);
        expect(result).toHaveProperty('content');
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
        expect(result.content[0]).toHaveProperty('text');

        const resultText = result.content[0].text;
        expect(typeof resultText).toBe('string');

        // Check if it's a success or failure message
        if (resultText.includes('✅ Successfully updated dependencies')) {
            expect(resultText).toContain('Successfully updated dependencies');
            expect(resultText).toContain('Updated packages:');

            // Verify the package.json was updated correctly
            const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
            const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

            // Check some key dependencies were updated
            expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core', '^20.0.0');
            expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli', '^20.0.0');
        } else if (resultText.includes('❌ Failed to resolve dependencies')) {
            expect(resultText).toContain('Failed to resolve dependencies');
            console.log('dumbResolverHandler failed as expected, result:', resultText);
        } else {
            // Unexpected result format
            throw new Error(`Unexpected result format: ${resultText}`);
        }
    });

    it('should invoke dumbResolverHandler with HYUI8 Angular dependencies', async function () {
        // Increase timeout for npm operations

        // Arrange - Copy asset files to test directory
        const assetsDir = path.join(__dirname, 'assets');
        const sourcePackageJsonPath = path.join(assetsDir, 'package_hyui8.json');
        const sourcePackageLockPath = path.join(assetsDir, 'package-lock_hyui8.json');
        const originalGitPath = path.join(path.resolve(assetsDir), 'git-git');
        

        const targetPackageJsonPath = path.join(testRepoPath, 'package.json');
        const targetPackageLockPath = path.join(testRepoPath, 'package-lock.json');
        const tempGitPath = path.join(testRepoPath, '.git');

        // Copy the asset files to test directory
        fs.copyFileSync(sourcePackageJsonPath, targetPackageJsonPath);
        fs.copyFileSync(sourcePackageLockPath, targetPackageLockPath);

        // Prepare input data for dumbResolverHandler using same dependencies as selected test
        const updateDependencies = [
            {
                name: '@angular/animations',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/common',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/compiler',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/core',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/forms',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/platform-browser-dynamic',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/router',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/cdk',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/material',
                version: '^19.0.0',
                isDev: false,
            },
            {
                name: '@angular/cli',
                version: '^19.0.0',
                isDev: true,
            },
            {
                name: '@angular/compiler-cli',
                version: '^19.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/build-angular',
                version: '^19.0.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/architect',
                version: '^0.2000.0',
                isDev: true,
            },
            {
                name: '@angular-devkit/core',
                version: '^19.0.0',
                isDev: true,
            },
            {
                name: '@angular/elements',
                version: '^19.0.0',
                isDev: true,
            },
            {
                name: '@angular/language-service',
                version: '^19.0.0',
                isDev: true,
            },
        ];

        const dumbResolverInput = {
            repo_path: testRepoPath,
            update_dependencies: updateDependencies,
            maxAttempts: parseInt(process.env.MAX_ATTEMPTS || '3', 10),
        };

        // Act - Invoke dumbResolverHandler
        const result = await dumbResolverHandler(dumbResolverInput);

        fs.copyFileSync(targetPackageJsonPath, sourcePackageJsonPath);
        fs.copyFileSync(targetPackageLockPath, sourcePackageLockPath);
        try {
            if (fs.existsSync(originalGitPath)) {
                fs.rmSync(originalGitPath, { recursive: true, force: true });
            }
            fs.cpSync(tempGitPath, originalGitPath, { recursive: true });
            console.log('[✅] Git directory copied back to assets.');
        } catch (error) {
            console.warn('Failed to copy git directory:', error);
            // Continue with test as this might not be critical
        }

        // Assert
        expect(result).toBeInstanceOf(Object);
        expect(result).toHaveProperty('content');
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
        expect(result.content[0]).toHaveProperty('text');

        const resultText = result.content[0].text;
        expect(typeof resultText).toBe('string');

        // Check if it's a success or failure message
        if (resultText.includes('✅ Successfully updated dependencies')) {
            console.log('(✅) Dependency resolution succeeded', { resultText });
            expect(resultText).toContain('Successfully updated dependencies');
            expect(resultText).toContain('Updated packages:');

            // Verify the package.json was updated correctly
            const updatedContent = fs.readFileSync(targetPackageJsonPath, 'utf8');
            const updatedPackageJson: PackageJson = JSON.parse(updatedContent);

            // Check some key dependencies were updated with major version 19
            expect(updatedPackageJson.dependencies).toBeDefined();
            expect(updatedPackageJson.dependencies).toHaveProperty('@angular/core');
            const coreVersion = updatedPackageJson.dependencies?.['@angular/core'];
            expect(coreVersion).toBeDefined();
            expect(semver.major(semver.coerce(coreVersion!)!)).toBe(19);
            
            expect(updatedPackageJson.devDependencies).toBeDefined();
            expect(updatedPackageJson.devDependencies).toHaveProperty('@angular/cli');
            const cliVersion = updatedPackageJson.devDependencies?.['@angular/cli'];
            expect(cliVersion).toBeDefined();
            expect(semver.major(semver.coerce(cliVersion!)!)).toBe(19);
        } else if (resultText.includes('❌ Failed to resolve dependencies')) {
            expect(resultText).toContain('Failed to resolve dependencies');
            console.log('dumbResolverHandler failed as expected, result:', resultText);
        } else {
            // Unexpected result format
            console.error(`Unexpected result format: ${resultText}`);
        }
    });
});
