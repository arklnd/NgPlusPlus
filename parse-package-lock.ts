#!/usr/bin/env node

/**
 * TypeScript script to parse package-lock.json using 'snyk-nodejs-lockfile-parser'
 * and create a table of packages and their dependents with versions.
 *
 * Usage:
 *   npx tsx parse-package-lock.ts [package-lock.json]
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

        // Build dependency tree
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
