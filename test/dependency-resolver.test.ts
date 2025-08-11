import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { updatePackageWithDependencies } from '../src/tools/dependency-resolver.tool.js';

interface PackageUpdate {
    name: string;
    version: string;
    isDev: boolean;
}

interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

describe('updatePackageWithDependencies', function () {
    let tempDir: string;
    let testRepoPath: string;
    
    beforeEach(function () {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngplusplus-test-'));
        testRepoPath = tempDir;
    });
    
    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    
    it('should update Angular dependencies to version 20.0.0', async function () {
        // Arrange
        const initialPackageJson: PackageJson = {
            name: "hy-ui-rel9",
            version: "1.0.0",
            dependencies: {
                "@angular/animations": "^19.0.0",
                "@angular/common": "^19.0.0",
                "@angular/core": "^19.0.0",
                "rxjs": "~7.8.0"
            },
            devDependencies: {
                "@angular/cli": "^19.0.0",
                "@angular/compiler-cli": "^19.0.0",
                "typescript": "~5.6.0"
            }
        };
        
        // Create initial package.json
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(initialPackageJson, null, 2));
        
        const plannedUpdates: PackageUpdate[] = [
            {
                "name": "@angular/animations",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/common",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/compiler",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/core",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/forms",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/platform-browser",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/platform-browser-dynamic",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/router",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/cdk",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/material",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/cli",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular/compiler-cli",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular-devkit/build-angular",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular-devkit/architect",
                "version": "^0.2000.0",
                "isDev": true
            },
            {
                "name": "@angular-devkit/core",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular/elements",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular/language-service",
                "version": "^20.0.0",
                "isDev": true
            }
        ];
        
        // Act
        const result = await updatePackageWithDependencies(testRepoPath, plannedUpdates);
        
        // Assert
        expect(result).to.be.a('string');
        expect(result).to.include('✅ package.json updated successfully');
        
        // Verify the package.json was updated correctly
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);
        
        // Check production dependencies
        expect(updatedPackageJson.dependencies).to.have.property('@angular/animations', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/common', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/compiler', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/platform-browser-dynamic', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/router', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/cdk', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/material', '^20.0.0');
        
        // Check development dependencies
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/build-angular', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/architect', '^0.2000.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular-devkit/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/elements', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/language-service', '^20.0.0');
        
        // Verify existing dependencies are preserved
        expect(updatedPackageJson.dependencies).to.have.property('rxjs', '~7.8.0');
        expect(updatedPackageJson.devDependencies).to.have.property('typescript', '~5.6.0');
    });
    
    it('should handle empty package.json', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                "name": "@angular/core",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/cli",
                "version": "^20.0.0",
                "isDev": true
            }
        ];
        
        // Act
        const result = await updatePackageWithDependencies(testRepoPath, plannedUpdates);
        
        // Assert
        expect(result).to.include('✅ package.json updated successfully');
        
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);
        
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
    });
    
    it('should count update operations correctly', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                "name": "@angular/animations",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/common",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/cli",
                "version": "^20.0.0",
                "isDev": true
            }
        ];
        
        // Act
        const result = await updatePackageWithDependencies(testRepoPath, plannedUpdates);
        
        // Assert
        const lines = result.split('\n');
        const updateLines = lines.filter(line => line.startsWith('✓ Updated'));
        expect(updateLines).to.have.length(3);
        
        expect(result).to.include('✓ Updated @angular/animations to ^20.0.0 (dependencies)');
        expect(result).to.include('✓ Updated @angular/common to ^20.0.0 (dependencies)');
        expect(result).to.include('✓ Updated @angular/cli to ^20.0.0 (devDependencies)');
    });
    
    it('should properly categorize dev and production dependencies', async function () {
        // Arrange
        const plannedUpdates: PackageUpdate[] = [
            {
                "name": "@angular/core",
                "version": "^20.0.0",
                "isDev": false
            },
            {
                "name": "@angular/forms",
                "version": "^20.0.0", 
                "isDev": false
            },
            {
                "name": "@angular/cli",
                "version": "^20.0.0",
                "isDev": true
            },
            {
                "name": "@angular/compiler-cli",
                "version": "^20.0.0",
                "isDev": true
            }
        ];
        
        // Act
        const result = await updatePackageWithDependencies(testRepoPath, plannedUpdates);
        
        // Assert
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        const updatedContent = fs.readFileSync(packageJsonPath, 'utf8');
        const updatedPackageJson: PackageJson = JSON.parse(updatedContent);
        
        // Production dependencies
        expect(updatedPackageJson.dependencies).to.have.property('@angular/core', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.have.property('@angular/forms', '^20.0.0');
        expect(updatedPackageJson.dependencies).to.not.have.property('@angular/cli');
        expect(updatedPackageJson.dependencies).to.not.have.property('@angular/compiler-cli');
        
        // Development dependencies
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.have.property('@angular/compiler-cli', '^20.0.0');
        expect(updatedPackageJson.devDependencies).to.not.have.property('@angular/core');
        expect(updatedPackageJson.devDependencies).to.not.have.property('@angular/forms');
    });
});
