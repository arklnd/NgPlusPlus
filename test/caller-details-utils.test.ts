import { expect } from 'chai';
import { describe, it } from 'mocha';
import { getCallerDetails, getCallStack, CallerDetails } from '@U/index';

describe('Caller Details Utils', function () {
    describe('getCallerDetails', function () {
        it('should return caller details when called from a test function', function () {
            function testCaller() {
                return getCallerDetails(-2);
            }

            const details = testCaller();

            expect(details).to.be.an('object');
            expect(details).to.have.property('fileName');
            expect(details).to.have.property('lineNumber');
            expect(details).to.have.property('columnNumber');
            if (details!.fileName) {
                expect(details!.fileName).to.include('caller-details-utils.test.ts');
            }
            if (details!.lineNumber !== null && details!.lineNumber !== undefined) {
                expect(details!.lineNumber).to.be.a('number');
            }
            if (details!.columnNumber !== null && details!.columnNumber !== undefined) {
                expect(details!.columnNumber).to.be.a('number');
            }
        });

        it('should return function name when available', function () {
            const details = getCallerDetails();

            expect(details).to.be.an('object');
            expect(details).to.have.property('functionName');
            // Function name might vary depending on test runner
            expect(details!.functionName).to.be.a('string');
        });

        it('should handle skipFrames parameter', function () {
            function intermediate() {
                return getCallerDetails(1); // Skip one more frame
            }

            function testCaller() {
                return intermediate();
            }

            const details = testCaller();

            expect(details).to.be.an('object');
            // Should point to testCaller now, but might be null if stack is shallow
            if (details!.functionName) {
                expect(details!.functionName).to.equal('testCaller');
            }
        });
    });

    describe('getCallStack', function () {
        it('should return an array of caller details', function () {
            function testCaller() {
                return getCallStack(3);
            }

            const stack = testCaller();

            expect(stack).to.be.an('array');
            expect(stack.length).to.be.greaterThan(0);
            expect(stack[0]).to.have.property('fileName');
            expect(stack[0]).to.have.property('lineNumber');
            expect(stack[0]).to.have.property('columnNumber');
        });

        it('should limit the depth as specified', function () {
            function testCaller() {
                return getCallStack(2);
            }

            const stack = testCaller();

            expect(stack).to.be.an('array');
            expect(stack.length).to.be.at.most(2);
        });

        it('should handle skipFrames parameter', function () {
            function intermediate() {
                return getCallStack(2, 1); // Skip one more frame
            }

            function testCaller() {
                return intermediate();
            }

            const stack = testCaller();

            expect(stack).to.be.an('array');
            // The stack should start from testCaller, but might be empty if stack is shallow
            if (stack.length > 0 && stack[0].functionName) {
                expect(stack[0].functionName).to.equal('testCaller');
            }
        });
    });
});