import { Script, type ScriptLike } from '@ckb-ccc/core';
import type { FieldHex } from './field.js';
import { V1_DOMAIN_TAGS } from './domains.js';
import { poseidonHashBytes } from './poseidon.js';

export type V1ScriptDomainKind = 'pool' | 'asset' | 'recipient';

export const V1_SCRIPT_SERIALIZATION = 'ckb-molecule-script-v1' as const;

/**
 * Derives a field domain from the exact canonical CCC/Molecule Script bytes.
 * The byte sponge consumes ordered 31-byte little-endian chunks; it never
 * reduces an arbitrary 32-byte digest modulo Fr.
 */
export async function deriveV1ScriptDomain(
    kind: V1ScriptDomainKind,
    script: ScriptLike,
): Promise<FieldHex> {
    const canonicalBytes = Script.from(script).toBytes();
    return poseidonHashBytes(V1_DOMAIN_TAGS[kind], canonicalBytes);
}

export function deriveV1PoolDomain(script: ScriptLike): Promise<FieldHex> {
    return deriveV1ScriptDomain('pool', script);
}

export function deriveV1AssetDomain(script: ScriptLike): Promise<FieldHex> {
    return deriveV1ScriptDomain('asset', script);
}

export function deriveV1RecipientDomain(script: ScriptLike): Promise<FieldHex> {
    return deriveV1ScriptDomain('recipient', script);
}
