import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyzeConflicts, ConflictResolution } from '../src/utils/conflict-resolution.utils.js';
import { PackageJson } from '../src/utils/package-json.utils.js';

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
    
    afterEach(function () {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    
    it('should analyze conflicts with existing dependencies', async function () {
        // Arrange
        const packageJson: PackageJson = {
            name: "test-project",
            version: "1.0.0",
            dependencies: {
                "@angular/core": "^19.0.0",
                "@angular/common": "^19.0.0",
                "rxjs": "~7.8.0"
            },
            devDependencies: {
                "@angular/cli": "^19.0.0"
            }
        };
        
        const plannedUpdates: PackageUpdate[] = [
            {
                name: "@angular/core",
                version: "^20.0.0",
                isDev: false
            },
            {
                name: "@angular/common",
                version: "^20.0.0",
                isDev: false
            }
        ];
        
        // Create package.json file
        const packageJsonPath = path.join(testRepoPath, 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        
        // Act
        const result: ConflictResolution = await analyzeConflicts(testRepoPath, packageJson, plannedUpdates);
        
        // Assert
        expect(result).to.be.an('object');
        expect(result).to.have.property('conflicts').that.is.an('array');
        expect(result).to.have.property('resolutions').that.is.an('array');
        
        // The function should complete without throwing errors
        expect(result.conflicts).to.be.an('array');
        expect(result.resolutions).to.be.an('array');
    });
});
