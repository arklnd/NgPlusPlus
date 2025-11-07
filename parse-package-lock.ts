#!/usr/bin/env node

/**
 * TypeScript script to parse package-lock.json and create a table of packages and their dependents with versions.
 * Supports both v2 and v3 package-lock.json formats.
 *
 * For v2: Uses 'snyk-nodejs-lockfile-parser'
 * For v3: Uses direct JSON parsing
 *
 * Usage:
 *   npx tsx parse-package-lock-unified.ts [package-lock.json]
 *
 * If no argument is provided, it will look for package-lock.json in the current directory.
 * The corresponding package.json must be in the same directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildDepTreeFromFiles, PkgTree } from 'snyk-nodejs-lockfile-parser';

interface PackageInfo {
    name: string;
    version: string;
    dependents: Array<{ name: string; version: string }>;
}

function traverseDependencies(depTree: any, packageMap: Map<string, PackageInfo>, parentName?: string, parentVersion?: string) {
    if (depTree.dependencies) {
        for (const [depName, depInfo] of Object.entries(depTree.dependencies)) {
            const dep = depInfo as any;

            // Add this dependency to the map if not already present
            if (!packageMap.has(depName)) {
                packageMap.set(depName, {
                    name: depName,
                    version: dep.version || '',
                    dependents: [],
                });
            }

            // If there's a parent, add the parent as a dependent of this dependency
            if (parentName) {
                const pkg = packageMap.get(depName);
                if (pkg) {
                    const existingDependent = pkg.dependents.find((d) => d.name === parentName);
                    if (!existingDependent) {
                        pkg.dependents.push({
                            name: parentName,
                            version: parentVersion || '',
                        });
                    }
                }
            }

            // Recursively traverse this dependency's dependencies
            traverseDependencies(dep, packageMap, depName, dep.version);
        }
    }
}

async function parsePackageLockV2(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
    const depTree: PkgTree = await buildDepTreeFromFiles(
        path.dirname(lockFilePath),
        packageJsonPath,
        lockFilePath,
        true, // includeDev
        false // strictOutOfSync
    );

    // Build a map of packages and their dependents
    const packageMap = new Map<string, PackageInfo>();

    // Traverse the dependency tree
    traverseDependencies(depTree, packageMap);

    // For top-level dependencies, add the root package as a dependent
    if (depTree.dependencies) {
        for (const [depName] of Object.entries(depTree.dependencies)) {
            const pkg = packageMap.get(depName);
            if (pkg) {
                const existingDependent = pkg.dependents.find((d) => d.name === depTree.name);
                if (!existingDependent) {
                    pkg.dependents.push({
                        name: depTree.name || 'root',
                        version: depTree.version || '',
                    });
                }
            }
        }
    }

    return packageMap;
}

async function parsePackageLockV3(packageJsonPath: string, lockFilePath: string): Promise<Map<string, PackageInfo>> {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const lockfile = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));

    const rootName = packageJson.name;
    const rootVersion = packageJson.version;
    const packages = lockfile.packages;

    // Build a map of packages
    const packageMap = new Map<string, PackageInfo>();

    // Add all packages from lockfile
    for (const [pkgPath, pkgInfo] of Object.entries(packages as any)) {
        if (pkgPath === '') continue; // skip root
        const name = (pkgInfo as any).name || pkgPath.split('/').pop();
        const version = (pkgInfo as any).version || '';
        if (!packageMap.has(name)) {
            packageMap.set(name, {
                name,
                version,
                dependents: [],
            });
        }
    }

    // Build dependents
    for (const [pkgPath, pkgInfo] of Object.entries(packages as any)) {
        const name = pkgPath === '' ? rootName : ((pkgInfo as any).name || pkgPath.split('/').pop());
        const version = (pkgInfo as any).version || '';
        const deps = { ...(pkgInfo as any).dependencies || {}, ...(pkgInfo as any).devDependencies || {} };
        for (const depName of Object.keys(deps)) {
            const pkg = packageMap.get(depName);
            if (pkg) {
                const existing = pkg.dependents.find((d) => d.name === name);
                if (!existing) {
                    pkg.dependents.push({
                        name,
                        version,
                    });
                }
            }
        }
    }

    return packageMap;
}

async function parsePackageLockAndCreateTable(packageLockPath?: string) {
    try {
        // Use provided path or default to current directory
        const lockFilePath = packageLockPath || path.join(process.cwd(), 'package-lock.json');
        const packageJsonPath = path.join(path.dirname(lockFilePath), 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
            console.error('package.json not found in the same directory as package-lock.json');
            return;
        }

        if (!fs.existsSync(lockFilePath)) {
            console.error('package-lock.json not found');
            return;
        }

        // Read lockfile to check version
        const lockfileContent = fs.readFileSync(lockFilePath, 'utf-8');
        const lockfile = JSON.parse(lockfileContent);
        const lockfileVersion = lockfile.lockfileVersion;

        let packageMap: Map<string, PackageInfo>;

        if (lockfileVersion === 2) {
            packageMap = await parsePackageLockV2(packageJsonPath, lockFilePath);
        } else if (lockfileVersion === 3) {
            packageMap = await parsePackageLockV3(packageJsonPath, lockFilePath);
        } else {
            console.error(`Unsupported lockfile version: ${lockfileVersion}. Only v2 and v3 are supported.`);
            return;
        }

        // Create table
        console.log('Package Dependencies Table');
        console.log('==========================');
        console.log('');

        // Sort packages by name
        const sortedPackages = Array.from(packageMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        for (const pkg of sortedPackages) {
            console.log(`Package: ${pkg.name}@${pkg.version}`);
            if (pkg.dependents.length > 0) {
                console.log('Dependents:');
                for (const dependent of pkg.dependents) {
                    console.log(`  - ${dependent.name}@${dependent.version}`);
                }
            } else {
                console.log('Dependents: None');
            }
            console.log('');
        }
    } catch (error) {
        console.error('Error parsing package-lock.json:', error);
    }
}

// Run the function
const packageLockArg = process.argv[2];
parsePackageLockAndCreateTable(packageLockArg);