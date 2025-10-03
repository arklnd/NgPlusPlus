#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { dumbResolverHandler } from './dist/tools/dumb-resolver.tool.js';

async function testPackageLockRemoval() {
    console.log('Testing package-lock.json removal functionality...');
    
    // Create a temporary directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-package-lock-removal-'));
    console.log('Created temp directory:', tempDir);
    
    try {
        // Create package.json
        const packageJson = {
            name: 'test-package',
            version: '1.0.0',
            dependencies: {
                'lodash': '^4.17.0'
            }
        };
        
        const packageLock = {
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
                    }
                }
            }
        };
        
        // Write files
        const packageJsonPath = path.join(tempDir, 'package.json');
        const packageLockPath = path.join(tempDir, 'package-lock.json');
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2));
        
        console.log('Created package.json and package-lock.json');
        console.log('package.json exists:', fs.existsSync(packageJsonPath));
        console.log('package-lock.json exists:', fs.existsSync(packageLockPath));
        
        // Test the dumbResolverHandler
        const input = {
            repo_path: tempDir,
            update_dependencies: [
                {
                    name: 'lodash',
                    version: '^4.17.21',
                    isDev: false
                }
            ]
        };
        
        console.log('Calling dumbResolverHandler...');
        const result = await dumbResolverHandler(input);
        
        console.log('Result:', result.content[0].text);
        
        // Check if files still exist
        console.log('After processing:');
        console.log('package.json exists:', fs.existsSync(packageJsonPath));
        console.log('package-lock.json exists:', fs.existsSync(packageLockPath));
        
        if (fs.existsSync(packageJsonPath)) {
            const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            console.log('Updated lodash version:', updatedPackageJson.dependencies.lodash);
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('Cleaned up temp directory');
        }
    }
}

testPackageLockRemoval().catch(console.error);