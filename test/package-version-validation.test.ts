import { expect, describe, it } from 'bun:test';
import { validatePackageVersionsExist } from '@U/index';

describe('Package Version Validation', () => {
    it('should validate existing package versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '4.17.21', isDev: false },
            { name: 'express', version: '4.18.2', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).toHaveLength(2);
        expect(results[0].exists).toBe(true);
        expect(results[0].packageName).toBe('lodash');
        expect(results[0].version).toBe('4.17.21');
        expect(results[1].exists).toBe(true);
        expect(results[1].packageName).toBe('express');
        expect(results[1].version).toBe('4.18.2');
    });

    it('should detect non-existing package versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '999.999.999', isDev: false },
            { name: 'nonexistent-package-xyz', version: '1.0.0', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).toHaveLength(2);
        expect(results[0].exists).toBe(false);
        expect(results[0].packageName).toBe('lodash');
        expect(results[0].version).toBe('999.999.999');
        expect(results[0].error).toBeDefined();
        expect(results[1].exists).toBe(false);
        expect(results[1].packageName).toBe('nonexistent-package-xyz');
        expect(results[1].version).toBe('1.0.0');
        expect(results[1].error).toBeDefined();
    });

    it('should handle mixed existing and non-existing versions', async () => {
        const plannedUpdates = [
            { name: 'lodash', version: '4.17.21', isDev: false },
            { name: 'express', version: '999.999.999', isDev: false },
        ];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).toHaveLength(2);
        expect(results[0].exists).toBe(true);
        expect(results[0].packageName).toBe('lodash');
        expect(results[1].exists).toBe(false);
        expect(results[1].packageName).toBe('express');
        expect(results[1].error).toBeDefined();
    });

    it('should handle scoped packages', async () => {
        const plannedUpdates = [{ name: '@types/node', version: '20.0.0', isDev: true }];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).toHaveLength(1);
        expect(results[0].exists).toBe(true);
        expect(results[0].packageName).toBe('@types/node');
        expect(results[0].version).toBe('20.0.0');
    });

    it('should handle empty planned updates array', async () => {
        const plannedUpdates: Array<{ name: string; version: string; isDev: boolean }> = [];

        const results = await validatePackageVersionsExist(plannedUpdates);

        expect(results).toHaveLength(0);
    });
});
