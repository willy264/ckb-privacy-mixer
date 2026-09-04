import { InvalidEncodingError } from '../core/errors.js';

declare const fieldBrand: unique symbol;
declare const fqBrand: unique symbol;
declare const hex32Brand: unique symbol;

export type FieldHex = `0x${string}` & { readonly [fieldBrand]: 'bn254-fr' };
export type FqHex = `0x${string}` & { readonly [fqBrand]: 'bn254-fq' };
export type Hex32 = `0x${string}` & { readonly [hex32Brand]: 'bytes32' };

export const BN254_FR_MODULUS =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const BN254_FQ_MODULUS =
    21888242871839275222246405745257275088696311157297823662689037894645226208583n;

const CANONICAL_BYTES32 = /^0x[0-9a-f]{64}$/;

export function assertHex32(value: string, name = 'value'): Hex32 {
    if (!CANONICAL_BYTES32.test(value)) {
        throw new InvalidEncodingError(
            `${name} must be a canonical lowercase 0x-prefixed 32-byte hex string.`,
            { name },
        );
    }
    return value as Hex32;
}

function assertFieldWithModulus<T extends string>(
    value: string,
    modulus: bigint,
    name: string,
): T {
    assertHex32(value, name);
    const decoded = BigInt(value);
    if (decoded >= modulus) {
        throw new InvalidEncodingError(`${name} is not a canonical field element.`, { name });
    }
    return value as T;
}

export function assertFieldHex(value: string, name = 'field'): FieldHex {
    return assertFieldWithModulus<FieldHex>(value, BN254_FR_MODULUS, name);
}

export function assertFqHex(value: string, name = 'coordinate'): FqHex {
    return assertFieldWithModulus<FqHex>(value, BN254_FQ_MODULUS, name);
}

function encodeBigInt(value: bigint, modulus: bigint, name: string): `0x${string}` {
    if (value < 0n || value >= modulus) {
        throw new InvalidEncodingError(`${name} is outside the canonical field range.`, { name });
    }
    return `0x${value.toString(16).padStart(64, '0')}`;
}

export function fieldFromBigInt(value: bigint, name = 'field'): FieldHex {
    return encodeBigInt(value, BN254_FR_MODULUS, name) as FieldHex;
}

export function fqFromBigInt(value: bigint, name = 'coordinate'): FqHex {
    return encodeBigInt(value, BN254_FQ_MODULUS, name) as FqHex;
}

export function fieldToBigInt(value: FieldHex | string, name = 'field'): bigint {
    return BigInt(assertFieldHex(value, name));
}

export function fqToBigInt(value: FqHex | string, name = 'coordinate'): bigint {
    return BigInt(assertFqHex(value, name));
}

export function bytesToBigIntLe(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let index = bytes.length - 1; index >= 0; index -= 1) {
        result = (result << 8n) | BigInt(bytes[index]);
    }
    return result;
}

export function bytesToBigIntBe(bytes: Uint8Array): bigint {
    let result = 0n;
    for (const byte of bytes) {
        result = (result << 8n) | BigInt(byte);
    }
    return result;
}

function bigintToBytesLe(value: bigint, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let remaining = value;
    for (let index = 0; index < length; index += 1) {
        bytes[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }
    if (remaining !== 0n) {
        throw new InvalidEncodingError(`Integer does not fit in ${length} bytes.`);
    }
    return bytes;
}

export function fieldToLeBytes(value: FieldHex | string, name = 'field'): Uint8Array {
    return bigintToBytesLe(fieldToBigInt(value, name), 32);
}

export function fqToLeBytes(value: FqHex | string, name = 'coordinate'): Uint8Array {
    return bigintToBytesLe(fqToBigInt(value, name), 32);
}

export function fieldFromLeBytes(bytes: Uint8Array, name = 'field'): FieldHex {
    if (bytes.length !== 32) {
        throw new InvalidEncodingError(`${name} must contain exactly 32 little-endian bytes.`, {
            name,
            length: bytes.length,
        });
    }
    return fieldFromBigInt(bytesToBigIntLe(bytes), name);
}

export function fqFromLeBytes(bytes: Uint8Array, name = 'coordinate'): FqHex {
    if (bytes.length !== 32) {
        throw new InvalidEncodingError(`${name} must contain exactly 32 little-endian bytes.`, {
            name,
            length: bytes.length,
        });
    }
    return fqFromBigInt(bytesToBigIntLe(bytes), name);
}

export function assertUnsignedInteger(
    value: bigint,
    bits: number,
    name: string,
): bigint {
    if (!Number.isSafeInteger(bits) || bits <= 0) {
        throw new InvalidEncodingError('Integer width must be a positive safe integer.');
    }
    if (value < 0n || value >= (1n << BigInt(bits))) {
        throw new InvalidEncodingError(`${name} must fit in an unsigned ${bits}-bit integer.`, {
            name,
        });
    }
    return value;
}

/**
 * Encodes a protocol label as the unsigned little-endian integer represented by
 * its UTF-8 bytes. FieldHex still displays that integer as canonical big-endian
 * hexadecimal; fieldToLeBytes is the circuit/contract wire conversion.
 */
export function asciiFieldTag(value: string): FieldHex {
    const bytes = new TextEncoder().encode(value);
    if (bytes.length === 0 || bytes.length > 31) {
        throw new InvalidEncodingError('A field domain tag must contain between 1 and 31 UTF-8 bytes.');
    }
    return fieldFromBigInt(bytesToBigIntLe(bytes), `domain tag ${value}`);
}
