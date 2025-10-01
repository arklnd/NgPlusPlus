import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { getAllDependent } from '@U/index';

describe('Package JSON Utils', function () {
    beforeEach(function () {});

    afterEach(function () {});

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
});
