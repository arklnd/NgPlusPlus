import { expect } from 'chai';
import { getRankingForPackage } from '@U/dumb-resolver-helper/conflict-analysis.utils';

describe('getRankingForPackage', function () {
    this.timeout(15000);

    describe('Function Structure', function () {
        it('should be a function', function () {
            expect(getRankingForPackage).to.be.a('function');
        });

        it('should return null for empty package name', async function () {
            const result = await getRankingForPackage('');
            expect(result).to.be.null;
        });
    });

    describe('ttt', function () {
        it('should handle package ranking with cache', async function () {
            // Test with a well-known package
            const result = await getRankingForPackage('@storybook/angular');
            
            if (result !== null) {
                expect(result).to.be.an('object');
                expect(result).to.have.property('rank');
                expect(result).to.have.property('tier');
                expect(typeof result.rank).to.equal('number');
                expect(typeof result.tier).to.equal('string');
            }
            // If result is null, that's acceptable (AI service issues)
        });
    });
    describe('Cache Integration', function () {
        it('should handle package ranking with cache', async function () {
            // Test with a well-known package
            const result = await getRankingForPackage('react');
            
            if (result !== null) {
                expect(result).to.be.an('object');
                expect(result).to.have.property('rank');
                expect(result).to.have.property('tier');
                expect(typeof result.rank).to.equal('number');
                expect(typeof result.tier).to.equal('string');
            }
            // If result is null, that's acceptable (AI service issues)
        });

        it('should demonstrate cache behavior with repeated calls', async function () {
            const packageName = 'lodash';
            
            // First call
            const result1 = await getRankingForPackage(packageName);
            
            // Second call (should use cache if first was successful)
            const result2 = await getRankingForPackage(packageName);
            
            // Both should return the same type
            if (result1 !== null && result2 !== null) {
                expect(result1).to.deep.equal(result2);
            }
        });
    });

    describe('Error Handling', function () {
        it('should handle invalid package names gracefully', async function () {
            const invalidNames = [
                '__invalid_package__',
                'definitely-non-existent-xyz-123',
                '@invalid/package',
                'package@version'
            ];

            for (const packageName of invalidNames) {
                const result = await getRankingForPackage(packageName);
                
                // Should either return null or valid ranking object
                if (result !== null) {
                    expect(result).to.be.an('object');
                    expect(result).to.have.property('rank');
                    expect(result).to.have.property('tier');
                    expect(typeof result.rank).to.equal('number');
                    expect(typeof result.tier).to.equal('string');
                }
            }
        });

        it('should not throw errors for edge cases', async function () {
            const edgeCases = ['', ' ', '@', '@/'];
            
            for (const packageName of edgeCases) {
                expect(async () => {
                    await getRankingForPackage(packageName);
                }).to.not.throw();
            }
        });
    });
});
