import { expect, describe, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyzeConflicts } from '@U/index';
import { ConflictResolution, PackageJson } from '@I/index';

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

describe('analyzeConflicts', function () {
    let tempDir: string;
    let testRepoPath: string;

    beforeEach(function () {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-conflict-test-'));
        testRepoPath = tempDir;
    });

    afterEach(async function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            // Add a small delay to allow npm processes to release file handles
            await new Promise((resolve) => setTimeout(resolve, 1000));

            try {
                // Try multiple times with increasing delays
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        break;
                    } catch (error) {
                        if (attempt === 3) {
                            console.warn(`Failed to clean up temp directory after ${attempt} attempts:`, tempDir);
                            // Don't throw - just warn and continue
                        } else {
                            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to clean up temp directory:', error);
            }
        }
    });

    it('should analyze conflicts with existing dependencies', async function () {
        // Increase timeout for npm operations

        // Arrange
        const packageJson: PackageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
                '@angular/core': '^19.0.0',
                '@angular/common': '^19.0.0',
                rxjs: '~7.8.0',
            },
            devDependencies: {
                '@angular/cli': '^19.0.0',
            },
        };

        const plannedUpdates: PackageUpdate[] = [
            {
                name: '@angular/core',
                version: '^20.0.0',
                isDev: false,
            },
            {
                name: '@angular/common',
                version: '^20.0.0',
                isDev: false,
            },
        ];

        // Create package.json file
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // Act
        const result: ConflictResolution = await analyzeConflicts(testRepoPath, true, packageJson, plannedUpdates);

        // Assert
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('conflicts');
        expect(result).toHaveProperty('resolutions');

        // The function should complete without throwing errors
        expect(Array.isArray(result.conflicts)).toBe(true);
        expect(Array.isArray(result.resolutions)).toBe(true);
    });

    it('should analyze conflicts for hyui-9 Angular upgrade scenario', async function () {
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
                name: '@angular/material',
                version: '^20.0.0',
                isDev: false,
            },
        ];

        // Act
        const result: ConflictResolution = await analyzeConflicts(testRepoPath, false, packageJson, plannedUpdates);

        // Assert
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('conflicts');
        expect(result).toHaveProperty('resolutions');

        // The function should complete without throwing errors
        expect(Array.isArray(result.conflicts)).toBe(true);
        expect(Array.isArray(result.resolutions)).toBe(true);
    });
    it('should analyze conflicts for hyui-10 Angular upgrade scenario', async function () {
        // Increase timeout for npm operations

        // Arrange
        const packageJson: PackageJson = {
            name: 'hyui-10-project',
            version: '1.0.0',
            dependencies: {
                '@angular-eslint/builder': '19.1.0',
                '@angular/animations': '^19.2.2',
                '@angular/cdk': '^19.2.2',
                '@angular/common': '^19.2.2',
                '@angular/compiler': '^19.2.2',
                '@angular/core': '^19.2.2',
                '@angular/forms': '^19.2.2',
                '@angular/material': '^19.2.3',
                '@angular/platform-browser': '^19.2.2',
                '@angular/platform-browser-dynamic': '^19.2.2',
                '@angular/router': '^19.2.2',
                '@hylandsoftware/design-tokens': '^2.0.0-rc.2',
                '@hylandsoftware/hy-ui-icons': '^4.1.6',
                '@igniteui/material-icons-extended': '^3.1.0',
                '@infragistics/igniteui-angular': 'npm:igniteui-angular@19.2.23',
                '@jsverse/transloco': '^7.4.0',
                '@juggle/resize-observer': '^3.4.0',
                '@storybook/core-server': '8.5.8',
                'angular-imask': '^7.6.1',
                'angular-oauth2-oidc': '19.0.0',
                'angular-split': '18.0.0-beta.1',
                hammerjs: '^2.0.8',
                'igniteui-theming': '18.0.1',
                'ignore-not-found-export-webpack-plugin': '^1.0.2',
                'ngx-color': '^9.0.0',
                rxjs: '^7.8.1',
                'shelljs-exec-proxy': '^0.2.1',
                tslib: '^2.7.0',
                'zone.js': '^0.15.0',
            },
            devDependencies: {
                '@angular-devkit/architect': '0.1902.3',
                '@angular-devkit/build-angular': '^19.2.2',
                '@angular-devkit/core': '^19.2.2',
                '@angular-eslint/eslint-plugin': '19.1.0',
                '@angular-eslint/eslint-plugin-template': '19.1.0',
                '@angular-eslint/template-parser': '19.1.0',
                '@angular/cli': '^19.2.2',
                '@angular/compiler-cli': '^19.2.2',
                '@angular/elements': '^19.2.2',
                '@angular/language-service': '^19.2.2',
                '@chromatic-com/storybook': '3.2.3',
                '@commitlint/cli': '19.4.1',
                '@commitlint/config-conventional': '19.4.1',
                '@commitlint/prompt-cli': '19.4.1',
                '@compodoc/compodoc': '^1.1.25',
                '@cypress/code-coverage': '^3.13.2',
                '@cypress/grep': '^4.1.0',
                '@cypress/schematic': '^3.0.0',
                '@eslint/compat': '^1.2.7',
                '@hylandsoftware/eslint-plugin-hy-ui-standards': '8.0.1',
                '@hylandsoftware/hy-ui-devkit': '8.0.1',
                '@hylandsoftware/hy-ui-standards': '8.0.1',
                '@istanbuljs/nyc-config-typescript': '^1.0.2',
                '@jsdevtools/coverage-istanbul-loader': '^3.0.5',
                '@storybook/addon-a11y': '8.5.8',
                '@storybook/addon-actions': '8.5.8',
                '@storybook/addon-docs': '8.5.8',
                '@storybook/addon-essentials': '8.5.8',
                '@storybook/addon-mdx-gfm': '8.5.0',
                '@storybook/addon-themes': '8.5.8',
                '@storybook/addon-viewport': '8.5.8',
                '@storybook/angular': '8.5.8',
                '@storybook/channels': '8.5.8',
                '@storybook/cli': '8.5.8',
                '@storybook/components': '8.5.8',
                '@storybook/manager-api': '8.5.8',
                '@storybook/preview-api': '8.5.8',
                '@storybook/theming': '8.5.8',
                '@types/gulp': '^4.0.17',
                '@types/hammerjs': '^2.0.45',
                '@types/node': '22.5.4',
                '@types/react': '^18.3.5',
                '@typescript-eslint/eslint-plugin': '^8.4.0',
                '@typescript-eslint/parser': '^8.4.0',
                'accessibility-insights-scan': '^3.2.0',
                'angular-http-server': '^1.12.0',
                'axe-core': '~4.10.0',
                backstopjs: '6.3.25',
                'core-js': '^3.38.1',
                cpx2: '^7.0.1',
                cypress: '14.2.0',
                'cypress-axe': '^1.5.0',
                'cypress-fail-fast': '^7.1.1',
                'cypress-file-upload': '^5.0.8',
                'cypress-mochawesome-reporter': '^3.8.2',
                'cypress-multi-reporters': '^2.0.5',
                'cypress-plugin-tab': '^1.0.5',
                'cypress-real-events': '^1.13.0',
                eslint: '^9.33.0',
                'eslint-config-prettier': '^10.0.1',
                'eslint-config-stylelint': '^23.0.0',
                'eslint-plugin-import': '2.31.0',
                'eslint-plugin-no-only-tests': '^3.3.0',
                'eslint-plugin-storybook': '^0.11.2',
                gulp: '~5.0.0',
                'gulp-replace': '^1.1.4',
                husky: '^8.0.3',
                'istanbul-lib-coverage': '^3.2.2',
                'lint-staged': '^15.2.10',
                'mocha-junit-reporter': '^2.2.1',
                'ng-packagr': '19.2.0',
                'npm-audit-resolver': '^3.0.0-RC.0',
                'npm-run-all': '~4.1.5',
                nyc: '^17.0.0',
                prettier: '^3.3.3',
                'pretty-quick': '^4.0.0',
                shelljs: '^0.8.5',
                'source-map-explorer': '^2.5.3',
                'standard-version': '^9.5.0',
                storybook: '8.5.8',
                'storybook-addon-rtl': '^1.0.1',
                'style-loader': '^4.0.0',
                'stylelint-config-prettier': '^9.0.5',
                'terser-webpack-plugin': '^5.3.10',
                'ts-node': '10.9.2',
                typescript: '~5.7.3',
                'wait-on': '^8.0.4',
                webpack: '^5.94.0',
            },
        };

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
                name: '@angular/material',
                version: '^20.0.0',
                isDev: false,
            },
        ];

        // Create package.json file
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // Act
        const result: ConflictResolution = await analyzeConflicts(testRepoPath, true, packageJson, plannedUpdates);

        // Assert
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('conflicts');
        expect(result).toHaveProperty('resolutions');

        // The function should complete without throwing errors
        expect(Array.isArray(result.conflicts)).toBe(true);
        expect(Array.isArray(result.resolutions)).toBe(true);
    });
});
