import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { existsSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DependencyMapParser, parseAndStoreDependencyMap, getPackageDependents, PackageInfo } from '@U/package-lock-parser.utils';

describe('Package Lock Parser Utils', function () {
    let testDir: string;
    let testPackageJsonPath: string;
    let testPackageLockPath: string;
    let testDbPath: string;

    beforeEach(function () {
        // Create a temporary directory for tests
        testDir = join(tmpdir(), `test-pkg-lock-parser-${Date.now()}`);
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        testPackageJsonPath = join(testDir, 'package.json');
        testPackageLockPath = join(testDir, 'package-lock.json');
        testDbPath = join(testDir, 'test-dependency-map.db');
    });

    afterEach(function () {
        // Clean up test directory - ensure database connections are closed first
        if (existsSync(testDir)) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            } catch (error) {
                // If cleanup fails, try again after a short delay
                setTimeout(() => {
                    try {
                        rmSync(testDir, { recursive: true, force: true });
                    } catch (retryError) {
                        console.warn('Failed to cleanup test directory:', retryError);
                    }
                }, 100);
            }
        }
    });

    describe('DependencyMapParser', function () {
        describe('parseAndStore (v2)', function () {
            beforeEach(function () {
                // Copy HYUI9 assets (lockfileVersion: 2)
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package.json'), testPackageJsonPath);
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package-lock.json'), testPackageLockPath);
            });

            it('should parse and store dependency map successfully', async function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                try {
                    await parser.parseAndStore(testPackageLockPath, testPackageJsonPath);

                    const allPackages = parser.getAllPackages();
                    expect(allPackages).to.have.length.greaterThan(0);

                    // Check that some common packages have dependents
                    const allPackageNames = allPackages.map(p => p.name);
                    expect(allPackageNames).to.include('@angular/core');

                    // Find a package that should have dependents
                    const angularCore = allPackages.find(p => p.name === '@angular/core');
                    expect(angularCore).to.not.be.undefined;
                    expect(angularCore!.dependents).to.have.length.greaterThan(0);
                } finally {
                    parser.close();
                }
            });
        });

        describe('parseAndStore (v3)', function () {
            beforeEach(function () {
                // Copy HYUI8 assets (lockfileVersion: 3)
                copyFileSync(join(process.cwd(), 'test/assets/HYUI8/package.json'), testPackageJsonPath);
                copyFileSync(join(process.cwd(), 'test/assets/HYUI8/package-lock.json'), testPackageLockPath);
            });

            it('should parse and store v3 dependency map successfully', async function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                try {
                    await parser.parseAndStore(testPackageLockPath, testPackageJsonPath);

                    const allPackages = parser.getAllPackages();
                    expect(allPackages).to.have.length.greaterThan(0);

                    // Check that some common packages have dependents
                    const allPackageNames = allPackages.map(p => p.name);
                    expect(allPackageNames).to.include('@angular/core');

                    // Find a package that should have dependents
                    const angularCore = allPackages.find(p => p.name === '@angular/core');
                    expect(angularCore).to.not.be.undefined;
                    expect(angularCore!.dependents).to.have.length.greaterThan(0);
                } finally {
                    parser.close();
                }
            });
        });

        describe('getDependents', function () {
            beforeEach(async function () {
                // Setup test data using HYUI9
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package.json'), testPackageJsonPath);
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package-lock.json'), testPackageLockPath);

                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                await parser.parseAndStore(testPackageLockPath, testPackageJsonPath);
                parser.close();
            });

            it('should return dependents for existing package', function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                const dependents = parser.getDependents('@angular/core');
                expect(dependents).to.not.be.null;
                expect(dependents).to.be.an('array');
                expect(dependents!.length).to.be.greaterThan(0);
                parser.close();
            });

            it('should return null for non-existing package', function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                const dependents = parser.getDependents('non-existing-package');
                expect(dependents).to.be.null;
                parser.close();
            });
        });

        describe('getAllPackages', function () {
            beforeEach(async function () {
                // Setup test data using HYUI9
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package.json'), testPackageJsonPath);
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package-lock.json'), testPackageLockPath);

                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                await parser.parseAndStore(testPackageLockPath, testPackageJsonPath);
                parser.close();
            });

            it('should return all packages with correct structure', function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                const allPackages: PackageInfo[] = parser.getAllPackages();

                expect(allPackages).to.be.an('array');
                expect(allPackages).to.have.length.greaterThan(0);

                allPackages.forEach(pkg => {
                    expect(pkg).to.have.property('name');
                    expect(pkg).to.have.property('version');
                    expect(pkg).to.have.property('dependents');
                    expect(pkg.dependents).to.be.an('array');
                });

                parser.close();
            });
        });

        describe('Error handling', function () {
            it('should throw error when package.json not found', async function () {
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                try {
                    await parser.parseAndStore('/non/existing/package-lock.json');
                    expect.fail('Should have thrown an error');
                } catch (error: any) {
                    expect(error.message).to.include('package.json not found');
                }
                parser.close();
            });

            it('should throw error when package-lock.json not found', async function () {
                copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package.json'), testPackageJsonPath);
                const parser = DependencyMapParser.getInstance({ dbPath: testDbPath });
                try {
                    await parser.parseAndStore('/non/existing/package-lock.json', testPackageJsonPath);
                    expect.fail('Should have thrown an error');
                } catch (error: any) {
                    expect(error.message).to.include('package-lock.json not found');
                }
                parser.close();
            });
        });
    });

    describe('Convenience functions', function () {
        beforeEach(function () {
            // Setup test data using HYUI9
            copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package.json'), testPackageJsonPath);
            copyFileSync(join(process.cwd(), 'test/assets/HYUI9/package-lock.json'), testPackageLockPath);
        });

        describe('parseAndStoreDependencyMap', function () {
            it('should parse and return parser instance', async function () {
                const parser = await parseAndStoreDependencyMap(testPackageLockPath, testPackageJsonPath, testDbPath);
                expect(parser).to.be.instanceOf(DependencyMapParser);

                const dependents = parser.getDependents('@angular/core');
                expect(dependents).to.not.be.null;

                parser.close();
            });
        });

        describe('getPackageDependents', function () {
            it('should return dependents for package', async function () {
                await parseAndStoreDependencyMap(testPackageLockPath, testPackageJsonPath, testDbPath);

                const dependents = getPackageDependents('@angular/core', testDbPath);
                expect(dependents).to.not.be.null;
                expect(dependents).to.be.an('array');
                expect(dependents!.length).to.be.greaterThan(0);
            });

            it('should return null for non-existing package', async function () {
                await parseAndStoreDependencyMap(testPackageLockPath, testPackageJsonPath, testDbPath);

                const dependents = getPackageDependents('non-existing', testDbPath);
                expect(dependents).to.be.null;
            });
        });
    });
});