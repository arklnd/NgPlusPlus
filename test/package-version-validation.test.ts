import { expect } from 'chai';
import { validatePackageVersionsExist } from '../src/utils/package-registry.utils.js';

describe('Package Version Validation', () => {
    it('should validate existing package versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '4.17.21', isDev: false },
            { name: 'express', version: '4.18.2', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).to.have.length(2);
        expect(results[0].exists).to.be.true;
        expect(results[0].packageName).to.equal('lodash');
        expect(results[0].version).to.equal('4.17.21');
        expect(results[1].exists).to.be.true;
        expect(results[1].packageName).to.equal('express');
        expect(results[1].version).to.equal('4.18.2');
    });

    it('should detect non-existing package versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '999.999.999', isDev: false },
            { name: 'nonexistent-package-xyz', version: '1.0.0', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).to.have.length(2);
        expect(results[0].exists).to.be.false;
        expect(results[0].packageName).to.equal('lodash');
        expect(results[0].version).to.equal('999.999.999');
        expect(results[0].error).to.exist;
        expect(results[1].exists).to.be.false;
        expect(results[1].packageName).to.equal('nonexistent-package-xyz');
        expect(results[1].version).to.equal('1.0.0');
        expect(results[1].error).to.exist;
    });

    it('should handle mixed existing and non-existing versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '4.17.21', isDev: false },
            { name: 'express', version: '999.999.999', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).to.have.length(2);
        expect(results[0].exists).to.be.true;
        expect(results[0].packageName).to.equal('lodash');
        expect(results[1].exists).to.be.false;
        expect(results[1].packageName).to.equal('express');
        expect(results[1].error).to.exist;
    });

    it('should handle scoped packages', async () => {
        const plannedUpdates = [{ name: '@types/node', version: '20.0.0', isDev: true }];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).to.have.length(1);
        expect(results[0].exists).to.be.true;
        expect(results[0].packageName).to.equal('@types/node');
        expect(results[0].version).to.equal('20.0.0');
    });

    it('should handle empty planned updates array', async () => {
        const plannedUpdates: Array<{ name: string; version: string; isDev: boolean }> = [];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).to.have.length(0);
    });
});
