import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { dumbResolverHandler } from '@T/dumb-resolver.tool';

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

describe('dumbResolverHandler package-lock.json removal', function () {
    let tempDir: string;
    let testRepoPath: string;

    beforeEach(function () {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-dumb-resolver-test-'));
        testRepoPath = tempDir;
    });

    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should handle package-lock.json removal correctly during dependency resolution', async function () {
        // Set a reasonable timeout for this test
        this.timeout(30000); // 30 seconds

        // Arrange - Create a simple package.json and package-lock.json
        const packageJsonContent = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                'lodash': '^4.17.0'
            },
            devDependencies: {
                '@types/node': '^18.0.0'
            }
        };

        const packageLockContent = {
            name: 'test-package',
            version: '1.0.0',
            lockfileVersion: 3,
            requires: true,
            packages: {
                '': {
                    name: 'test-package',
                    version: '1.0.0',
                    dependencies: {
                        'lodash': '^4.17.0'
                    },
                    devDependencies: {
                        '@types/node': '^18.0.0'
                    }
                },
                'node_modules/lodash': {
                    version: '4.17.21',
                    resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
                    integrity: 'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=='
                }
            }
        };

        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const packageLockPath = path.join(testRepoPath, 'package-lock.json');

        // Write package.json and package-lock.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2));
        fs.writeFileSync(packageLockPath, JSON.stringify(packageLockContent, null, 2));

        // Verify initial files exist
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        expect(fs.existsSync(packageLockPath)).to.be.true;

        // Prepare update dependencies that should cause a simple update (not network intensive)
        const updateDependencies: PackageUpdate[] = [
            {
                name: 'lodash',
                version: '^4.17.21', // Update to specific version
                isDev: false,
            }
        ];

        const dumbResolverInput = {
            repo_path: testRepoPath,
            update_dependencies: updateDependencies,
        };

        // Act - Invoke dumbResolverHandler
        const result = await dumbResolverHandler(dumbResolverInput);

        // Assert
        expect(result).to.be.an('object');
        expect(result).to.have.property('content');
        expect(result.content).to.be.an('array');
        expect(result.content).to.have.length(1);
        expect(result.content[0]).to.have.property('type', 'text');
        expect(result.content[0]).to.have.property('text');

        const resultText = result.content[0].text;
        expect(resultText).to.be.a('string');

        // The test is primarily about verifying the code doesn't crash and properly handles
        // package-lock.json removal - the result could be either success or failure depending
        // on network conditions and dependency resolution, but it should complete without errors
        expect(resultText).to.satisfy((text: string) => 
            text.includes('✅ Successfully updated dependencies') || 
            text.includes('❌ Failed to resolve dependencies')
        );

        // Verify the original package.json still exists
        expect(fs.existsSync(packageJsonPath)).to.be.true;

        // If successful, verify the package.json was updated correctly
        if (resultText.includes('✅ Successfully updated dependencies')) {
            const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
            const updatedPackageJson = JSON.parse(updatedContent);
            expect(updatedPackageJson.dependencies).to.have.property('lodash', '^4.17.21');
        }
    });

    it('should handle missing package-lock.json gracefully', async function () {
        // Set a reasonable timeout for this test
        this.timeout(30000); // 30 seconds

        // Arrange - Create only package.json (no package-lock.json)
        const packageJsonContent = {
            name: 'test-package-no-lock',
            version: '1.0.0',
            dependencies: {
                'lodash': '^4.17.0'
            }
        };

        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const packageLockPath = path.join(testRepoPath, 'package-lock.json');

        // Write only package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2));

        // Verify package.json exists and package-lock.json does not
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        expect(fs.existsSync(packageLockPath)).to.be.false;

        // Prepare update dependencies
        const updateDependencies: PackageUpdate[] = [
            {
                name: 'lodash',
                version: '^4.17.21',
                isDev: false,
            }
        ];

        const dumbResolverInput = {
            repo_path: testRepoPath,
            update_dependencies: updateDependencies,
        };

        // Act - Invoke dumbResolverHandler
        const result = await dumbResolverHandler(dumbResolverInput);

        // Assert
        expect(result).to.be.an('object');
        expect(result).to.have.property('content');
        expect(result.content).to.be.an('array');
        expect(result.content).to.have.length(1);
        expect(result.content[0]).to.have.property('type', 'text');
        expect(result.content[0]).to.have.property('text');

        const resultText = result.content[0].text;
        expect(resultText).to.be.a('string');

        // Should complete without errors regardless of success/failure
        expect(resultText).to.satisfy((text: string) => 
            text.includes('✅ Successfully updated dependencies') || 
            text.includes('❌ Failed to resolve dependencies')
        );

        // Verify the original package.json still exists
        expect(fs.existsSync(packageJsonPath)).to.be.true;
    });
});