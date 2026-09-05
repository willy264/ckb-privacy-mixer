import { InvalidArgumentError } from '../core/errors.js';
import { assertFieldHex, type FieldHex } from '../crypto/field.js';
import { V1_DOMAIN_TAGS } from '../crypto/domains.js';
import { poseidonHash } from '../crypto/poseidon.js';
import { V1_MERKLE_DEPTH } from '../protocol/pool.js';

export async function deriveV1EmptyLeaf(poolDomain: FieldHex): Promise<FieldHex> {
    return poseidonHash([
        V1_DOMAIN_TAGS.merkleEmpty,
        assertFieldHex(poolDomain, 'poolDomain'),
    ]);
}

export async function hashV1MerkleNode(input: {
    readonly poolDomain: FieldHex;
    readonly level: number;
    readonly left: FieldHex;
    readonly right: FieldHex;
}): Promise<FieldHex> {
    if (!Number.isSafeInteger(input.level) || input.level < 0 || input.level >= V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError(`Merkle level must be between 0 and ${V1_MERKLE_DEPTH - 1}.`);
    }
    return poseidonHash([
        V1_DOMAIN_TAGS.merkleNode,
        assertFieldHex(input.poolDomain, 'poolDomain'),
        BigInt(input.level),
        assertFieldHex(input.left, 'left child'),
        assertFieldHex(input.right, 'right child'),
    ]);
}

export async function getV1EmptyRoots(
    poolDomain: FieldHex,
    depth: number = V1_MERKLE_DEPTH,
): Promise<readonly FieldHex[]> {
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError(`Merkle depth must be between 1 and ${V1_MERKLE_DEPTH}.`);
    }
    const roots: FieldHex[] = [await deriveV1EmptyLeaf(poolDomain)];
    for (let level = 0; level < depth; level += 1) {
        roots.push(await hashV1MerkleNode({
            poolDomain,
            level,
            left: roots[level],
            right: roots[level],
        }));
    }
    return roots;
}
