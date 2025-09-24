import { expect } from 'chai';

describe('Sample Test', function () {
    it('should add numbers correctly', function () {
        const sum = 1 + 1;
        expect(sum).to.equal(2);
    });
    
    it('should validate TypeScript compilation', function () {
        const message: string = 'TypeScript works!';
        expect(message).to.be.a('string');
        expect(message).to.equal('TypeScript works!');
    });
});
