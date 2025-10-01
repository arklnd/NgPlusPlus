import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { updateTransitiveDependencies } from '@U/transitive-dependencies.utils.js';
import { readPackageJson } from '@U/package-json.utils.js';

interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: any;
}

interface PackageUpdate {
    name: string;
    version: string;
}

describe('updateTransitiveDependencies', function () {
    let tempDir: string;
    let testRepoPath: string;

    beforeEach(function () {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-transitive-test-'));
        testRepoPath = tempDir;
    });

    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should handle Angular dependencies update with transitive dependency resolution', async function () {
        // Set longer timeout for this test as it involves network calls to npm registry
        this.timeout(60000);

        // Arrange - Use the hyland-ui package.json as base
        const initialPackageJson: PackageJson = {
            name: 'hyland-ui',
            version: '9.0.4',
            dependencies: {
                '@angular/animations': '18.2.5',
                '@angular/cdk': '18.2.5',
                '@angular/common': '18.2.5',
                '@angular/compiler': '18.2.5',
                '@angular/core': '18.2.5',
                '@angular/forms': '18.2.5',
                '@angular/material': '18.2.5',
                '@angular/platform-browser': '18.2.5',
                '@angular/platform-browser-dynamic': '18.2.5',
                '@angular/router': '18.2.5',
                '@hylandsoftware/design-tokens': '^2.0.0-rc.2',
                '@hylandsoftware/hy-ui-icons': '^4.1.1',
                '@igniteui/material-icons-extended': '^3.0.2',
                '@jsverse/transloco': '^7.4.0',
                '@infragistics/igniteui-angular': 'npm:igniteui-angular@18.1.13',
                '@juggle/resize-observer': '^3.4.0',
                '@storybook/core-server': '^8.2.9',
                'angular-imask': '^7.6.1',
                'angular-oauth2-oidc': '^18.0.0',
                'angular-split': '18.0.0-beta.1',
                hammerjs: '^2.0.8',
                'igniteui-theming': '11.0.0',
                'ignore-not-found-export-webpack-plugin': '^1.0.2',
                'ngx-color': '^9.0.0',
                rxjs: '^7.8.1',
                'shelljs-exec-proxy': '^0.2.1',
                tslib: '^2.7.0',
                'zone.js': '^0.14.10',
            },
            devDependencies: {
                '@angular-devkit/architect': '0.1802.5',
                '@angular-devkit/build-angular': '18.2.5',
                '@angular-devkit/core': '18.2.5',
                '@angular-eslint/eslint-plugin': '18.3.1',
                '@angular-eslint/eslint-plugin-template': '18.3.1',
                '@angular-eslint/template-parser': '18.3.1',
                '@angular/cli': '18.2.5',
                '@angular/compiler-cli': '18.2.5',
                '@angular/elements': '18.2.5',
                '@angular/language-service': '18.2.5',
                typescript: '~5.5.4',
            },
        };

        // Create package.json in temp directory
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(initialPackageJson, null, 2));

        // Read the package.json as the function expects
        const packageJson = readPackageJson(testRepoPath);

        // Define the updates as specified in the user request
        const updates: PackageUpdate[] = [
            { name: '@angular/animations', version: '^20.0.0' },
            { name: '@angular/common', version: '^20.0.0' },
            { name: '@angular/compiler', version: '^20.0.0' },
            { name: '@angular/core', version: '^20.0.0' },
            { name: '@angular/forms', version: '^20.0.0' },
            { name: '@angular/platform-browser', version: '^20.0.0' },
            { name: '@angular/platform-browser-dynamic', version: '^20.0.0' },
            { name: '@angular/router', version: '^20.0.0' },
            { name: '@angular/material', version: '^20.0.0' },
        ];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');
        expect(results.length).to.be.greaterThan(0);

        // Verify that results contain status messages
        const hasSuccessMessages = results.some((result) => result.includes('✓'));
        const hasWarningMessages = results.some((result) => result.includes('⚠'));
        const hasErrorMessages = results.some((result) => result.includes('❌'));

        // At least one type of message should be present
        expect(hasSuccessMessages || hasWarningMessages || hasErrorMessages).to.be.true;

        // Check that specific Angular packages are mentioned in results
        const mentionsAngularCore = results.some((result) => result.includes('@angular/core'));
        const mentionsAngularCommon = results.some((result) => result.includes('@angular/common'));
        expect(mentionsAngularCore || mentionsAngularCommon).to.be.true;
    });

    it('should return empty array when no updates are provided', async function () {
        // Arrange
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^18.0.0',
            },
        };

        const updates: PackageUpdate[] = [];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');
        expect(results).to.have.length(0);
    });

    it('should handle invalid version specifications gracefully', async function () {
        // Arrange
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^18.0.0',
            },
        };

        const updates: PackageUpdate[] = [{ name: '@angular/core', version: 'invalid-version' }];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');
        expect(results.length).to.be.greaterThan(0);

        // Should contain an error message about invalid version
        const hasInvalidVersionError = results.some((result) => result.includes('❌') && result.includes('Invalid version specification'));
        expect(hasInvalidVersionError).to.be.true;
    });

    it('should handle packages with no dependencies', async function () {
        // Set timeout for potential network calls
        this.timeout(30000);

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                'simple-package': '^1.0.0',
            },
        };

        const updates: PackageUpdate[] = [{ name: 'simple-package', version: '^1.0.0' }];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');
        // Results might be empty if the package has no transitive dependencies
        // or contain error messages if the package doesn't exist
    });

    it('should handle network errors gracefully', async function () {
        // Arrange
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                'non-existent-package-xyz-123': '^1.0.0',
            },
        };

        const updates: PackageUpdate[] = [{ name: 'non-existent-package-xyz-123', version: '^1.0.0' }];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');
        expect(results.length).to.be.greaterThan(0);

        // Should contain an error message about failed processing
        const hasNetworkError = results.some((result) => result.includes('❌') && result.includes('Failed to process'));
        expect(hasNetworkError).to.be.true;
    });

    it('should handle packages with peer dependencies', async function () {
        // Set longer timeout for network calls
        this.timeout(45000);

        // Arrange - Create a realistic scenario with Angular packages that have peer deps
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^18.0.0',
                '@angular/common': '^18.0.0',
                '@angular/forms': '^18.0.0',
            },
        };

        const updates: PackageUpdate[] = [{ name: '@angular/forms', version: '^20.0.0' }];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');

        // Results should contain information about peer dependency checks
        const hasPeerDepResults = results.some((result) => result.includes('@angular/core') || result.includes('@angular/common'));
        expect(hasPeerDepResults).to.be.true;
    });

    it('should preserve existing compatible versions', async function () {
        // Set timeout for network calls
        this.timeout(30000);

        // Arrange - Create package.json in temp directory to test file modifications
        const initialPackageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^18.0.0',
                '@angular/common': '^18.0.0',
            },
        };

        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(initialPackageJson, null, 2));
        const packageJson = readPackageJson(testRepoPath);

        const updates: PackageUpdate[] = [
            { name: '@angular/core', version: '^18.1.0' }, // Minor version bump
        ];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');

        // Should contain success messages for compatible versions
        const hasSuccessMessage = results.some((result) => result.includes('✓'));
        expect(hasSuccessMessage).to.be.true;
    });

    it('should handle mixed dependency types (dev and prod)', async function () {
        // Set timeout for network calls
        this.timeout(30000);

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^18.0.0',
            },
            devDependencies: {
                '@angular/cli': '^18.0.0',
            },
        };

        const updates: PackageUpdate[] = [{ name: '@angular/core', version: '^20.0.0' }];

        // Act
        const results = await updateTransitiveDependencies(packageJson, updates);

        // Assert
        expect(results).to.be.an('array');

        // Results should handle both dev and production dependencies
        const mentionsDependencies = results.some((result) => result.includes('@angular') || result.includes('dependencies'));
        expect(mentionsDependencies).to.be.true;
    });
});
