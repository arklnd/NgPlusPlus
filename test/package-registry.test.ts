import { expect, describe, it } from 'bun:test';
import { getPackageData, getPackageVersionData, getPackageVersions, validatePackageVersionsExist } from '@U/package-registry.utils';

describe('Package Registry Utils', function () {
    describe('getPackageData', function () {
        it('should fetch package data for a popular package', async function () {
            const packageData = await getPackageData('lodash');

            expect(typeof packageData).toBe('object');
            expect(packageData.name).toBe('lodash');
            expect(typeof packageData['dist-tags']).toBe('object');
            expect(packageData['dist-tags'].latest).toBeTypeOf('string');
            expect(Array.isArray(packageData.versions)).toBe(true);
            expect(packageData.versions.length).toBeGreaterThan(0);
            expect(packageData.description).toBeTypeOf('string');
        });

        it('should fetch readme for lodash', async function () {
            const packageData = await getPackageData('lodash', ['readme']);
            expect(typeof packageData).toBe('object');
        });

        it('should fetch readme for typescript', async function () {
            const packageData = await getPackageData('typescript', ['readme']);
            expect(typeof packageData).toBe('object');
        });

        it('should fetch package data for a scoped package', async function () {
            const packageData = await getPackageData('@types/node');

            expect(typeof packageData).toBe('object');
            expect(packageData.name).toBe('@types/node');
            expect(typeof packageData['dist-tags']).toBe('object');
            expect(packageData['dist-tags'].latest).toBeTypeOf('string');
            expect(Array.isArray(packageData.versions)).toBe(true);
            expect(packageData.versions.length).toBeGreaterThan(0);
        });
    });
});
