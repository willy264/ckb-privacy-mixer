declare module 'crypto' {
    interface Hash {
        update(data: string | Uint8Array): Hash;
        digest(encoding: 'hex'): string;
    }

    interface RandomBytesResult extends Uint8Array {
        toString(encoding: 'hex'): string;
    }

    export function createHash(algorithm: string): Hash;
    export function randomBytes(size: number): RandomBytesResult;
}
