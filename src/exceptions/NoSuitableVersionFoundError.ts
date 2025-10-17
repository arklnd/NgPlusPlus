export class NoSuitableVersionFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoSuitableVersionFoundError';
    }
}
