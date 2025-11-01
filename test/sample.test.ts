import { expect, describe, it } from 'bun:test';

describe('Sample Test', function () {
    it('should add numbers correctly', function () {
        const sum = 1 + 1;
        expect(sum).toBe(2);
    });

    it('should validate TypeScript compilation', function () {
        const message: string = 'TypeScript works!';
        expect(message).toBeTypeOf('string');
        expect(message).toBe('TypeScript works!');
    });
});
