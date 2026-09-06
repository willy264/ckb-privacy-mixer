import { InvalidArgumentError } from '../core/errors.js';
import { assertFieldHex, fieldFromBigInt, type FieldHex } from './field.js';
import { V1_DOMAIN_TAGS } from './domains.js';
import { poseidonHash } from './poseidon.js';

export interface V1LeafInput {
    readonly poolDomain: FieldHex;
    readonly assetDomain: FieldHex;
    readonly denomination: bigint;
    readonly secret: FieldHex;
    readonly nullifierSecret: FieldHex;
}

export async function deriveV1Leaf(input: V1LeafInput): Promise<FieldHex> {
    if (input.denomination <= 0n) {
        throw new InvalidArgumentError('Pool denomination must be positive.');
    }

    return poseidonHash([
        V1_DOMAIN_TAGS.leaf,
        assertFieldHex(input.poolDomain, 'poolDomain'),
        assertFieldHex(input.assetDomain, 'assetDomain'),
        fieldFromBigInt(input.denomination, 'denomination'),
        assertFieldHex(input.secret, 'secret'),
        assertFieldHex(input.nullifierSecret, 'nullifierSecret'),
    ]);
}

export async function deriveV1NullifierHash(input: {
    readonly poolDomain: FieldHex;
    readonly nullifierSecret: FieldHex;
    readonly leafIndex: number;
}): Promise<FieldHex> {
    if (!Number.isSafeInteger(input.leafIndex) || input.leafIndex < 0 || input.leafIndex >= 2 ** 20) {
        throw new InvalidArgumentError('leafIndex must be an integer in the V1 depth-20 tree.');
    }

    return poseidonHash([
        V1_DOMAIN_TAGS.nullifier,
        assertFieldHex(input.poolDomain, 'poolDomain'),
        assertFieldHex(input.nullifierSecret, 'nullifierSecret'),
        BigInt(input.leafIndex),
    ]);
}

export async function deriveV1AuthTag(input: {
    readonly secret: FieldHex;
    readonly recipientDomain: FieldHex;
    readonly actionHash: FieldHex;
}): Promise<FieldHex> {
    return poseidonHash([
        V1_DOMAIN_TAGS.auth,
        assertFieldHex(input.secret, 'secret'),
        assertFieldHex(input.recipientDomain, 'recipientDomain'),
        assertFieldHex(input.actionHash, 'actionHash'),
    ]);
}
