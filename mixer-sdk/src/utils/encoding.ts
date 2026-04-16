export function normalizeHex(value: string): string {
    return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

export function hexToBytes(hex: string): Uint8Array {
    const normalized = normalizeHex(hex);
    if (normalized.length % 2 !== 0) {
        throw new Error(`Hex string must have even length: ${hex}`);
    }

    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
        const byte = Number.parseInt(normalized.slice(i, i + 2), 16);
        if (Number.isNaN(byte)) {
            throw new Error(`Invalid hex string: ${hex}`);
        }
        bytes[i / 2] = byte;
    }
    return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function utf8ToBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
        combined.set(part, offset);
        offset += part.length;
    }

    return combined;
}

export function u32LeBytes(value: number): Uint8Array {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    return new Uint8Array(buffer);
}
