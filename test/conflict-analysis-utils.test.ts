import { expect } from 'chai';
import { describe, it } from 'mocha';
import { hydrateConflictAnalysisWithRanking, hydrateConflictAnalysisWithRegistryData, parseInstallErrorToConflictAnalysis } from '@U/dumb-resolver-helper/conflict-analysis.utils';
import { createStrategicPrompt } from '@/utils/dumb-resolver-helper/template-generator.utils';

describe('parseInstallErrorToConflictAnalysis', function () {
    // Increase timeout for AI operations
    this.timeout(3600000);

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
            `,
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
            `,
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
            `,
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
            `,
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
            `,
        },
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

    it('manual_test', async () => {
        const installError = `npm install failed with exit code 1: npm warn ERESOLVE overriding peer dependency
npm warn While resolving: hyland-ui@8.5.2
npm warn Found: @angular-devkit/architect@0.1602.2
npm warn node_modules/@angular-devkit/architect
npm warn   dev @angular-devkit/architect@"^0.2000.0" from the root project
npm warn   4 more (@angular-devkit/build-angular, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer @angular-devkit/architect@">=0.1400.0 < 0.1700.0" from @storybook/angular@7.4.2
npm warn node_modules/@storybook/angular
npm warn   dev @storybook/angular@"7.4.2" from the root project
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error
npm error While resolving: hyland-ui@8.5.2
npm error Found: @angular-devkit/build-angular@16.2.2
npm error node_modules/@angular-devkit/build-angular
npm error   dev @angular-devkit/build-angular@"^19.0.0" from the root project
npm error   peer @angular-devkit/build-angular@">=16.2.2" from @hylandsoftware/hy-ui-devkit@6.0.0
npm error   node_modules/@hylandsoftware/hy-ui-devkit
npm error     dev @hylandsoftware/hy-ui-devkit@"^6.0.0" from the root project
npm error   1 more (@storybook/angular)
npm error
npm error Could not resolve dependency:
npm error dev @angular-devkit/build-angular@"^19.0.0" from the root project
npm error
npm error Conflicting peer dependency: typescript@5.8.3
npm error node_modules/typescript
npm error   peer typescript@">=5.5 <5.9" from @angular-devkit/build-angular@19.2.19
npm error   node_modules/@angular-devkit/build-angular
npm error     dev @angular-devkit/build-angular@"^19.0.0" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry
npm error this command with --no-strict-peer-deps, --force, or --legacy-peer-deps
npm error to accept an incorrect (and potentially broken) dependency resolution.
npm error
npm error`;

        try {
            let currentAnalysis = await parseInstallErrorToConflictAnalysis(installError);

            // Enhance analysis with ranking
            currentAnalysis = await hydrateConflictAnalysisWithRanking(currentAnalysis);

            // Enhance analysis with available versions from registry
            currentAnalysis = await hydrateConflictAnalysisWithRegistryData(currentAnalysis);

            const strategicPrompt = createStrategicPrompt({ updateMade: [] }, installError, currentAnalysis, '', 1, 1);

            // Should return a valid structure even for malformed input
            expect(currentAnalysis).to.be.an('object');
            expect(currentAnalysis).to.have.property('conflictingPackage');
            expect(currentAnalysis).to.have.property('conflictingPackageCurrentVersion');
            expect(currentAnalysis).to.have.property('satisfyingPackages');
            expect(currentAnalysis).to.have.property('notSatisfying');

            console.log('currentAnalysis for malformed error:', JSON.stringify(currentAnalysis, null, 2));
        } catch (error) {
            console.error('Test failed with error:', error);
            throw error;
        }
    });
});
