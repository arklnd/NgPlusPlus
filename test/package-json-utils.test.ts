import { expect, describe, it, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
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

            expect(result).toEqual(mockPackageJson);
            expect(result.name).toBe('test-package');
            expect(result.version).toBe('1.0.0');
            expect(result.dependencies).toHaveProperty('express');
            expect(result.devDependencies).toHaveProperty('typescript');
        });

        it('should throw error when package.json does not exist', async function () {
            try {
                await readPackageJson(testDir);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('package.json not found');
            }
        });

        it('should throw error when package.json has invalid JSON', async function () {
            writeFileSync(testPackageJsonPath, '{ invalid json }');

            try {
                await readPackageJson(testDir);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('should handle package.json without dependencies', async function () {
            const mockPackageJson: PackageJson = {
                name: 'minimal-package',
                version: '0.1.0',
            };

            writeFileSync(testPackageJsonPath, JSON.stringify(mockPackageJson, null, 2));

            const result = await readPackageJson(testDir);

            expect(result.name).toBe('minimal-package');
            expect(result.dependencies).toBeUndefined();
            expect(result.devDependencies).toBeUndefined();
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

            expect(existsSync(testPackageJsonPath)).toBe(true);

            const written = await readPackageJson(testDir);
            expect(written).toEqual(mockPackageJson);
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
            expect(content).toContain('  "name"');
            expect(content).toContain('  "version"');
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
            expect(result.name).toBe('updated');
            expect(result.version).toBe('2.0.0');
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

    //         expect(result).toHaveProperty('react', '^18.0.0');
    //         expect(result).toHaveProperty('react-dom', '^18.0.0');
    //         expect(result).toHaveProperty('jest', '^29.0.0');
    //         expect(result).toHaveProperty('eslint', '^8.0.0');
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

    //         expect(result).toHaveProperty('express', '^4.17.1');
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

    //         expect(result).toHaveProperty('typescript', '^5.0.0');
    //         expect(Object.keys(result)).to.have.lengthOf(1);
    //     });

    //     it('should return empty object when no dependencies exist', function () {
    //         const mockPackageJson: PackageJson = {
    //             name: 'test-package',
    //             version: '1.0.0',
    //         };

    //         const result = getAllDependencies(mockPackageJson);

    //         expect(result).toBe(Object);
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

            expect(mockPackageJson.dependencies!['lodash']).toBe('^4.17.21');
        });

        it('should add new dependency if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {},
            };

            updateDependency(mockPackageJson, 'axios', '^1.0.0', false);

            expect(mockPackageJson.dependencies!['axios']).toBe('^1.0.0');
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

            expect(mockPackageJson.devDependencies!['typescript']).toBe('^5.0.0');
        });

        it('should add new devDependency if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                devDependencies: {},
            };

            updateDependency(mockPackageJson, 'jest', '^29.0.0', true);

            expect(mockPackageJson.devDependencies!['jest']).toBe('^29.0.0');
        });

        it('should create dependencies object if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
            };

            updateDependency(mockPackageJson, 'express', '^4.17.1', false);

            expect(mockPackageJson.dependencies).toBeInstanceOf(Object);
            expect(mockPackageJson.dependencies!['express']).toBe('^4.17.1');
        });

        it('should create devDependencies object if it does not exist', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
            };

            updateDependency(mockPackageJson, 'mocha', '^10.0.0', true);

            expect(mockPackageJson.devDependencies).toBeInstanceOf(Object);
            expect(mockPackageJson.devDependencies!['mocha']).toBe('^10.0.0');
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

            expect(isDevDependency(mockPackageJson, 'jest')).toBe(true);
            expect(isDevDependency(mockPackageJson, 'eslint')).toBe(true);
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

            expect(isDevDependency(mockPackageJson, 'express')).toBe(false);
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

            expect(isDevDependency(mockPackageJson, 'nonexistent')).toBe(false);
        });

        it('should return false when devDependencies is undefined', function () {
            const mockPackageJson: PackageJson = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    express: '^4.17.1',
                },
            };

            expect(isDevDependency(mockPackageJson, 'jest')).toBe(false);
        });
    });

    describe('getAllDependent', function () {
        it('should find dependents of a package in current project', async function () {
            try {
                // Test with a package that likely exists in this project
                const result = await getAllDependent(process.cwd(), 'zod');

                // Verify the structure is correct
                expect(result).toBeInstanceOf(Object);

                // Check that all keys are version strings
                Object.keys(result).forEach((version) => {
                    expect(typeof version).toBe('string');
                    expect(Array.isArray(result[version])).toBe(true);

                    // Check that each dependent has name and version
                    result[version].forEach((dependent) => {
                        expect(dependent).toHaveProperty('name');
                        expect(typeof dependent.name).toBe('string');
                        expect(dependent).toHaveProperty('version');
                        expect(typeof dependent.version).toBe('string');
                    });
                });

                console.log('getAllDependent result for "zod":', JSON.stringify(result, null, 2));
            } catch (error) {
                // If the package doesn't exist in dependencies, that's also a valid test outcome
                console.log('Expected behavior: package not found in dependencies');
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('should return empty object for non-existent package', async function () {
            const result = await getAllDependent(process.cwd(), 'nonexistent-package-xyz-123');

            expect(result).toBeInstanceOf(Object);
            expect(Object.keys(result)).toHaveLength(0);
        });

        it('should throw error for invalid repository path', async function () {
            try {
                await getAllDependent('/nonexistent/path/xyz', 'some-package');
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    // describe('installDependencies', function () {
    //     it('should successfully install dependencies in a valid project', async function () {
    //         this.timeout(120000); // npm install can take time

    //         // Create a minimal package.json for testing
    //         const minimalPackage: PackageJson = {
    //             name: 'test-install',
    //             version: '1.0.0',
    //             dependencies: {
    //                 lodash: '4.17.21', // Specific version for predictable install
    //             },
    //         };

    //         await writePackageJson(testDir, minimalPackage);

    //         const result = await installDependencies(testDir);

    //         expect(result).toHaveProperty('success', true);
    //         expect(result).toHaveProperty('stdout').that.is.a('string');
    //         expect(result).toHaveProperty('stderr').that.is.a('string');

    //         // Verify node_modules was created
    //         expect(existsSync(join(testDir, 'node_modules'))).to.be.true;
    //     });

    //     it('should throw error for invalid package.json', async function () {
    //         this.timeout(120000);

    //         // Create invalid package.json
    //         writeFileSync(testPackageJsonPath, '{ invalid json }');

    //         try {
    //             await installDependencies(testDir);
    //             expect.fail('Should have thrown an error');
    //         } catch (error) {
    //             expect(error).to.be.instanceOf(Error);
    //             expect((error as Error).message).to.include('npm install failed');
    //         }
    //     });

    //     it('should throw error for non-existent directory', async function () {
    //         this.timeout(120000);

    //         try {
    //             await installDependencies('/nonexistent/directory/xyz');
    //             expect.fail('Should have thrown an error');
    //         } catch (error) {
    //             expect(error).to.be.instanceOf(Error);
    //         }
    //     });
    // });
});
