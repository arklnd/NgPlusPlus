import { createPackageValidationErrorMessage } from '@U/index';

export class PackageVersionValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PackageVersionValidationError';
    }

    /**
     * Generates a retry message with the error details embedded using handlebars template
     * @param errorMessage Optional additional error details to include
     * @param additionalGuidance Optional additional guidance for the AI
     * @returns Formatted retry message
     */
    getRetryMessage(errorMessage?: string, additionalGuidance?: string): string {
        return createPackageValidationErrorMessage(errorMessage || this.message, additionalGuidance);
    }

    /**
     * Static method to generate retry message without creating an instance
     * @param errorMessage Error details to include
     * @param additionalGuidance Optional additional guidance for the AI
     * @returns Formatted retry message
     */
    static generateRetryMessage(errorMessage: string, additionalGuidance?: string): string {
        return createPackageValidationErrorMessage(errorMessage, additionalGuidance);
    }
}