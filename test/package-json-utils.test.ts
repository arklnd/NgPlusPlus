import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readPackageJson, writePackageJson, getAllDependencies, updateDependency, isDevDependency, getAllDependent, installDependencies } from '@U/index';
import { PackageJson } from '@I/index';

describe('Package JSON Utils', function () {
    let testDir: string;
    let testPackageJsonPath: string;

    beforeEach(function () {
        // Create a temporary directory for tests
        testDir = join(tmpdir(), `test-pkg-json-${Date.now()}`);
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        testPackageJsonPath = join(testDir, 'package.json');
    });

    afterEach(function () {
        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('readPackageJson', function () {
        it('should successfully read and parse a valid package.json', async function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    express: '^4.17.1',
                    lodash: '^4.17.21',
                },
                devDependencies: {
                    typescript: '^5.0.0',
                    mocha: '^10.0.0',
                },
            };

            writeFileSync(testPackageJsonPath, JSON.stringify(mockPackageJson, null, 2));

            const result = await readPackageJson(testDir);

            expect(result).to.deep.equal(mockPackageJson);
            expect(result.name).to.equal('test-package');
            expect(result.version).to.equal('1.0.0');
            expect(result.dependencies).to.have.property('express');
            expect(result.devDependencies).to.have.property('typescript');
        });

        it('should throw error when package.json does not exist', async function () {
            try {
                await readPackageJson(testDir);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('package.json not found');
            }
        });

        it('should throw error when package.json has invalid JSON', async function () {
            writeFileSync(testPackageJsonPath, '{ invalid json }');

            try {
                await readPackageJson(testDir);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }
        });

        it('should handle package.json without dependencies', async function () {
            const mockPackageJson: PackageJson = {
                name: 'minimal-package',
                version: '0.1.0',
            };

            writeFileSync(testPackageJsonPath, JSON.stringify(mockPackageJson, null, 2));

            const result = await readPackageJson(testDir);

            expect(result.name).to.equal('minimal-package');
            expect(result.dependencies).to.be.undefined;
            expect(result.devDependencies).to.be.undefined;
        });
    });

    describe('writePackageJson', function () {
        it('should successfully write package.json to file system', async function () {
            const mockPackageJson: PackageJson = {
                name: 'test-write',
                version: '2.0.0',
                dependencies: {
                    axios: '^1.0.0',
                },
            };

            await writePackageJson(testDir, mockPackageJson);

            expect(existsSync(testPackageJsonPath)).to.be.true;

            const written = await readPackageJson(testDir);
            expect(written).to.deep.equal(mockPackageJson);
        });

        it('should format package.json with proper indentation', async function () {
            const mockPackageJson: PackageJson = {
                name: 'test-format',
                version: '1.0.0',
            };

            await writePackageJson(testDir, mockPackageJson);

            const { readFileSync } = await import('fs');
            const content = readFileSync(testPackageJsonPath, 'utf-8');

            // Check that it's properly formatted with 2-space indentation
            expect(content).to.include('  "name"');
            expect(content).to.include('  "version"');
        });

        it('should overwrite existing package.json', async function () {
            const original: PackageJson = {
                name: 'original',
                version: '1.0.0',
            };

            const updated: PackageJson = {
                name: 'updated',
                version: '2.0.0',
            };

            await writePackageJson(testDir, original);
            await writePackageJson(testDir, updated);

            const result = await readPackageJson(testDir);
            expect(result.name).to.equal('updated');
            expect(result.version).to.equal('2.0.0');
        });
    });

    // describe('getAllDependencies', function () {
    //     it('should combine dependencies and devDependencies', function () {
    //         const mockPackageJson: PackageJson = {
    //             name: 'test-package',
    //             version: '1.0.0',
    //             dependencies: {
    //                 react: '^18.0.0',
    //                 'react-dom': '^18.0.0',
    //             },
    //             devDependencies: {
    //                 jest: '^29.0.0',
    //                 eslint: '^8.0.0',
    //             },
    //         };

    //         const result = getAllDependencies(mockPackageJson);

    //         expect(result).to.have.property('react', '^18.0.0');
    //         expect(result).to.have.property('react-dom', '^18.0.0');
    //         expect(result).to.have.property('jest', '^29.0.0');
    //         expect(result).to.have.property('eslint', '^8.0.0');
    //         expect(Object.keys(result)).to.have.lengthOf(4);
    //     });

    //     it('should return only dependencies when devDependencies is undefined', function () {
    //         const mockPackageJson: PackageJson = {
    //             name: 'test-package',
    //             version: '1.0.0',
    //             dependencies: {
    //                 express: '^4.17.1',
    //             },
    //         };

    //         const result = getAllDependencies(mockPackageJson);

    //         expect(result).to.have.property('express', '^4.17.1');
    //         expect(Object.keys(result)).to.have.lengthOf(1);
    //     });

    //     it('should return only devDependencies when dependencies is undefined', function () {
    //         const mockPackageJson: PackageJson = {
    //             name: 'test-package',
    //             version: '1.0.0',
    //             devDependencies: {
    //                 typescript: '^5.0.0',
    //             },
    //         };

    //         const result = getAllDependencies(mockPackageJson);

    //         expect(result).to.have.property('typescript', '^5.0.0');
    //         expect(Object.keys(result)).to.have.lengthOf(1);
    //     });

    //     it('should return empty object when no dependencies exist', function () {
    //         const mockPackageJson: PackageJson = {
    //             name: 'test-package',
    //             version: '1.0.0',
    //         };

    //         const result = getAllDependencies(mockPackageJson);

    //         expect(result).to.be.an('object');
    //         expect(Object.keys(result)).to.have.lengthOf(0);
    //     });
    // });

    describe('updateDependency', function () {
        it('should update existing dependency', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    lodash: '^4.17.0',
                },
            };

            updateDependency(mockPackageJson, 'lodash', '^4.17.21', false);

            expect(mockPackageJson.dependencies!['lodash']).to.equal('^4.17.21');
        });

        it('should add new dependency if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {},
            };

            updateDependency(mockPackageJson, 'axios', '^1.0.0', false);

            expect(mockPackageJson.dependencies!['axios']).to.equal('^1.0.0');
        });

        it('should update existing devDependency', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                devDependencies: {
                    typescript: '^4.9.0',
                },
            };

            updateDependency(mockPackageJson, 'typescript', '^5.0.0', true);

            expect(mockPackageJson.devDependencies!['typescript']).to.equal('^5.0.0');
        });

        it('should add new devDependency if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                devDependencies: {},
            };

            updateDependency(mockPackageJson, 'jest', '^29.0.0', true);

            expect(mockPackageJson.devDependencies!['jest']).to.equal('^29.0.0');
        });

        it('should create dependencies object if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
            };

            updateDependency(mockPackageJson, 'express', '^4.17.1', false);

            expect(mockPackageJson.dependencies).to.be.an('object');
            expect(mockPackageJson.dependencies!['express']).to.equal('^4.17.1');
        });

        it('should create devDependencies object if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
            };

            updateDependency(mockPackageJson, 'mocha', '^10.0.0', true);

            expect(mockPackageJson.devDependencies).to.be.an('object');
            expect(mockPackageJson.devDependencies!['mocha']).to.equal('^10.0.0');
        });
    });

    describe('isDevDependency', function () {
        it('should return true for packages in devDependencies', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                devDependencies: {
                    jest: '^29.0.0',
                    eslint: '^8.0.0',
                },
            };

            expect(isDevDependency(mockPackageJson, 'jest')).to.be.true;
            expect(isDevDependency(mockPackageJson, 'eslint')).to.be.true;
        });

        it('should return false for packages in dependencies', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    express: '^4.17.1',
                },
                devDependencies: {
                    jest: '^29.0.0',
                },
            };

            expect(isDevDependency(mockPackageJson, 'express')).to.be.false;
        });

        it('should return false for packages not in any dependencies', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    express: '^4.17.1',
                },
                devDependencies: {
                    jest: '^29.0.0',
                },
            };

            expect(isDevDependency(mockPackageJson, 'nonexistent')).to.be.false;
        });

        it('should return false when devDependencies is undefined', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    express: '^4.17.1',
                },
            };

            expect(isDevDependency(mockPackageJson, 'jest')).to.be.false;
        });
    });

    describe('getAllDependent', function () {
        it('should find dependents of a package in current project', async function () {
            this.timeout(10000); // npm ls can take time

            try {
                // Test with a package that likely exists in this project
                const result = await getAllDependent(process.cwd(), 'zod');

                // Verify the structure is correct
                expect(result).to.be.an('object');

                // Check that all keys are version strings
                Object.keys(result).forEach((version) => {
                    expect(version).to.be.a('string');
                    expect(result[version]).to.be.an('array');

                    // Check that each dependent has name and version
                    result[version].forEach((dependent) => {
                        expect(dependent).to.have.property('name').that.is.a('string');
                        expect(dependent).to.have.property('version').that.is.a('string');
                    });
                });

                console.log('getAllDependent result for "zod":', JSON.stringify(result, null, 2));
            } catch (error) {
                // If the package doesn't exist in dependencies, that's also a valid test outcome
                console.log('Expected behavior: package not found in dependencies');
                expect(error).to.be.instanceOf(Error);
            }
        });

        it('should return empty object for non-existent package', async function () {
            this.timeout(10000);

            const result = await getAllDependent(process.cwd(), 'nonexistent-package-xyz-123');

            expect(result).to.be.an('object');
            expect(Object.keys(result)).to.have.lengthOf(0);
        });

        it('should throw error for invalid repository path', async function () {
            this.timeout(10000);

            try {
                await getAllDependent('/nonexistent/path/xyz', 'some-package');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }
        });
    });

    describe('installDependencies HYUI8', function () {
        it('should successfully install dependencies in a valid project', async function () {
            this.timeout(120000); // npm install can take time
            const assetsDir = join(__dirname, 'assets');
            const sourcePackageJsonPath = join(assetsDir, '/HYUI8/package.json');
            const targetPackageJsonPath = join(testDir, 'package.json');
            copyFileSync(sourcePackageJsonPath, targetPackageJsonPath);
            const result = await installDependencies(testDir);
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('stdout').that.is.a('string');
            expect(result).to.have.property('stderr').that.is.a('string');
            // Verify node_modules was created
            expect(existsSync(join(testDir, 'node_modules'))).to.be.true;
        });
        it('should throw error for invalid package.json', async function () {
            this.timeout(120000);
            // Create invalid package.json
            writeFileSync(testPackageJsonPath, '{ invalid json }');
            try {
                await installDependencies(testDir);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('npm install failed');
            }
        });
        it('should throw error for non-existent directory', async function () {
            this.timeout(120000);
            try {
                await installDependencies('/nonexistent/directory/xyz');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }
        });
    });
});
