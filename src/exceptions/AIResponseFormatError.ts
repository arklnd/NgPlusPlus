import { createAIResponseFormatErrorMessage } from '@U/index';

export class AIResponseFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIResponseFormatError';
    }

    /**
     * Generates a retry message with the error details embedded using handlebars template
     * @param errorMessage Optional additional error details to include
     * @returns Formatted retry message
     */
    getRetryMessage(errorMessage?: string): string {
        return createAIResponseFormatErrorMessage(errorMessage || this.message);
    }

    /**
     * Static method to generate retry message without creating an instance
     * @param errorMessage Error details to include
     * @returns Formatted retry message
     */
    static generateRetryMessage(errorMessage: string): string {
        return createAIResponseFormatErrorMessage(errorMessage);
    }
}