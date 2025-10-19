import { expect } from 'chai';
import { 
    getPackageData, 
    getPackageVersionData, 
    getPackageVersions, 
    validatePackageVersionsExist 
} from '../src/utils/package-registry.utils.js';

describe('Package Registry Utils', function () {
    // Increase timeout for npm operations
    this.timeout(30000);

    describe('getPackageData', function () {
        it('should fetch package data for a popular package', async function () {
            const packageData = await getPackageData('lodash');
            
            expect(packageData).to.be.an('object');
            expect(packageData.name).to.equal('lodash');
            expect(packageData['dist-tags']).to.be.an('object');
            expect(packageData['dist-tags'].latest).to.be.a('string');
            expect(packageData.versions).to.be.an('array');
            expect(packageData.versions.length).to.be.greaterThan(0);
            expect(packageData.description).to.be.a('string');
        });
        it('should fetch readme for a popular package', async function () {
            const packageData = await getPackageData('lodash', ['readme']);
            expect(packageData).to.be.an('object');
        });

        it('should fetch package data for a scoped package', async function () {
            const packageData = await getPackageData('@types/node');
            
            expect(packageData).to.be.an('object');
            expect(packageData.name).to.equal('@types/node');
            expect(packageData['dist-tags']).to.be.an('object');
            expect(packageData['dist-tags'].latest).to.be.a('string');
            expect(packageData.versions).to.be.an('array');
            expect(packageData.versions.length).to.be.greaterThan(0);
        });
    });
});