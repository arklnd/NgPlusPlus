import { expect } from 'chai';
import { describe, it } from 'mocha';
import { parseInstallErrorToConflictAnalysis } from '@U/dumb-resolver-helper/conflict-analysis.utils';

describe('parseInstallErrorToConflictAnalysis', function () {
    // Increase timeout for AI operations
    this.timeout(30000);

    const sampleInstallErrors = [
        {
            name: 'Angular compiler-cli conflict',
            error: `
npm install failed with exit code 1: npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error
npm error While resolving: hyland-ui@8.5.2
npm error Found: @angular/compiler-cli@20.3.6
npm error node_modules/@angular/compiler-cli
npm error   dev @angular/compiler-cli@\"20.3.6\" from the root project
npm error
npm error Could not resolve dependency:
npm error peer @angular/compiler-cli@\"^21.0.0-next.0\" from @angular-devkit/build-angular@21.0.0-next.8
npm error node_modules/@angular-devkit/build-angular
npm error   dev @angular-devkit/build-angular@\"21.0.0-next.8\" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry
npm error this command with --no-strict-peer-deps, --force, or --legacy-peer-deps
npm error to accept an incorrect (and potentially broken) dependency resolution.
            `
        },
        {
            name: 'TypeScript version conflict',
            error: `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
npm ERR! 
npm ERR! While resolving: @angular/core@16.0.0
npm ERR! Found: typescript@4.9.5
npm ERR! node_modules/typescript
npm ERR!   typescript@"^4.9.0" from the root project
npm ERR! 
npm ERR! Could not resolve dependency:
npm ERR! peer typescript@">=5.0.0" from @angular/core@16.0.0
npm ERR! node_modules/@angular/core
npm ERR!   @angular/core@"16.0.0" from the root project
npm ERR! 
npm ERR! Conflicting peer dependency: typescript@5.1.6
npm ERR! node_modules/typescript
npm ERR!   peer typescript@">=5.0.0" from @angular/core@16.0.0
            `
        },
        {
            name: 'React version conflict',
            error: `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! 
npm ERR! While resolving: my-react-app@1.0.0
npm ERR! Found: react@17.0.2
npm ERR! node_modules/react
npm ERR!   react@"^17.0.0" from the root project
npm ERR! 
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^18.0.0" from react-router-dom@6.8.1
npm ERR! node_modules/react-router-dom
npm ERR!   react-router-dom@"^6.8.0" from the root project
            `
        },
        {
            name: 'Multiple peer dependency conflicts',
            error: `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! 
npm ERR! While resolving: complex-app@2.1.0
npm ERR! Found: eslint@7.32.0
npm ERR! node_modules/eslint
npm ERR!   dev eslint@"^7.32.0" from the root project
npm ERR! 
npm ERR! Could not resolve dependency:
npm ERR! peer eslint@"^8.0.0" from @typescript-eslint/parser@5.59.0
npm ERR! node_modules/@typescript-eslint/parser
npm ERR!   dev @typescript-eslint/parser@"^5.59.0" from the root project
npm ERR! 
npm ERR! Conflicting peer dependency: eslint@8.40.0
npm ERR! node_modules/eslint
npm ERR!   peer eslint@"^8.0.0" from @typescript-eslint/eslint-plugin@5.59.0
npm ERR!   node_modules/@typescript-eslint/eslint-plugin
npm ERR!     dev @typescript-eslint/eslint-plugin@"^5.59.0" from the root project
            `
        },
        {
            name: 'Node.js version compatibility error',
            error: `
npm ERR! code EBADENGINE
npm ERR! engine Unsupported engine
npm ERR! engine Not compatible with your version of node/npm
npm ERR! notsup Not compatible with your version of node/npm: some-package@3.0.0
npm ERR! notsup Required: {"node":">=18.0.0","npm":">=8.0.0"}
npm ERR! notsup Actual:   {"npm":"7.24.0","node":"16.20.0"}
            `
        }
    ];

    sampleInstallErrors.forEach((testCase, index) => {
        it(`should parse ${testCase.name} and return conflict analysis`, async function () {
            try {
                console.log(`\n--- Testing case ${index + 1}: ${testCase.name} ---`);
                const result = await parseInstallErrorToConflictAnalysis(testCase.error);
                
                // Basic structure validation
                expect(result).to.be.an('object');
                expect(result).to.have.property('conflictingPackage');
                expect(result).to.have.property('conflictingPackageCurrentVersion');
                expect(result).to.have.property('satisfyingPackages');
                expect(result).to.have.property('notSatisfying');
                
                // Arrays should be defined (even if empty)
                expect(result.satisfyingPackages).to.be.an('array');
                expect(result.notSatisfying).to.be.an('array');
                
                console.log(`Result for ${testCase.name}:`, JSON.stringify(result, null, 2));
                
            } catch (error) {
                console.error(`Test failed for ${testCase.name} with error:`, error);
                throw error;
            }
        });
    });

    it('should handle empty error string gracefully', async function () {
        const emptyError = '';
        
        try {
            const result = await parseInstallErrorToConflictAnalysis(emptyError);
            
            // Should return a valid structure even for empty input
            expect(result).to.be.an('object');
            expect(result).to.have.property('conflictingPackage');
            expect(result).to.have.property('conflictingPackageCurrentVersion');
            expect(result).to.have.property('satisfyingPackages');
            expect(result).to.have.property('notSatisfying');
            
            console.log('Result for empty error:', JSON.stringify(result, null, 2));
            
        } catch (error) {
            console.error('Test failed with error:', error);
            throw error;
        }
    });

    it('should handle malformed error string', async function () {
        const malformedError = 'This is not a real npm error message';
        
        try {
            const result = await parseInstallErrorToConflictAnalysis(malformedError);
            
            // Should return a valid structure even for malformed input
            expect(result).to.be.an('object');
            expect(result).to.have.property('conflictingPackage');
            expect(result).to.have.property('conflictingPackageCurrentVersion');
            expect(result).to.have.property('satisfyingPackages');
            expect(result).to.have.property('notSatisfying');
            
            console.log('Result for malformed error:', JSON.stringify(result, null, 2));
            
        } catch (error) {
            console.error('Test failed with error:', error);
            throw error;
        }
    });
});