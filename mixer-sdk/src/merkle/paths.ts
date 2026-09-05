import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, type FieldHex } from '../crypto/field.js';
import { V1_MERKLE_DEPTH } from '../protocol/pool.js';
import { getV1EmptyRoots, hashV1MerkleNode } from './roots.js';

export type MerklePathBit = 0 | 1;

export interface V1MerklePath {
    readonly leaf: FieldHex;
    readonly leafIndex: number;
    readonly siblings: readonly FieldHex[];
    readonly pathIndices: readonly MerklePathBit[];
    readonly root: FieldHex;
}

export interface V1MerkleTreeSnapshot {
    readonly poolDomain: FieldHex;
    readonly depth: number;
    readonly leaves: readonly FieldHex[];
    readonly levels: readonly (readonly FieldHex[])[];
    readonly root: FieldHex;
}

function assertLeafIndex(index: number, leafCount: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= leafCount) {
        throw new InvalidArgumentError(`Leaf index ${index} is outside the tree.`);
    }
}

export async function buildV1MerkleTree(
    poolDomain: FieldHex,
    leaves: readonly FieldHex[],
    depth = V1_MERKLE_DEPTH,
): Promise<V1MerkleTreeSnapshot> {
    assertFieldHex(poolDomain, 'poolDomain');
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError(`Merkle depth must be between 1 and ${V1_MERKLE_DEPTH}.`);
    }
    if (leaves.length > 2 ** depth) {
        throw new InvalidArgumentError('Leaf count exceeds Merkle tree capacity.');
    }

    const canonicalLeaves = leaves.map((leaf, index) => assertFieldHex(leaf, `leaves[${index}]`));
    const emptyRoots = await getV1EmptyRoots(poolDomain, depth);
    if (canonicalLeaves.length === 0) {
        return Object.freeze({
            poolDomain,
            depth,
            leaves: Object.freeze([]),
            levels: Object.freeze([Object.freeze([])]),
            root: emptyRoots[depth],
        });
    }

    const levels: FieldHex[][] = [[...canonicalLeaves]];
    for (let level = 0; level < depth; level += 1) {
        const current = levels[level];
        const next: FieldHex[] = [];
        for (let index = 0; index < current.length; index += 2) {
            next.push(await hashV1MerkleNode({
                poolDomain,
                level,
                left: current[index],
                right: current[index + 1] ?? emptyRoots[level],
            }));
        }
        levels.push(next);
    }

    return Object.freeze({
        poolDomain,
        depth,
        leaves: Object.freeze([...canonicalLeaves]),
        levels: Object.freeze(levels.map(level => Object.freeze(level))),
        root: levels[depth][0],
    });
}

export async function createV1MerklePath(
    tree: V1MerkleTreeSnapshot,
    leafIndex: number,
): Promise<V1MerklePath> {
    assertLeafIndex(leafIndex, tree.leaves.length);
    const emptyRoots = await getV1EmptyRoots(tree.poolDomain, tree.depth);
    const siblings: FieldHex[] = [];
    const pathIndices: MerklePathBit[] = [];
    let index = leafIndex;

    for (let level = 0; level < tree.depth; level += 1) {
        const nodes = tree.levels[level];
        const isRight = index % 2 === 1;
        siblings.push(nodes[isRight ? index - 1 : index + 1] ?? emptyRoots[level]);
        pathIndices.push(isRight ? 1 : 0);
        index = Math.floor(index / 2);
    }

    return Object.freeze({
        leaf: tree.leaves[leafIndex],
        leafIndex,
        siblings: Object.freeze(siblings),
        pathIndices: Object.freeze(pathIndices),
        root: tree.root,
    });
}

export async function computeV1MerkleRoot(
    poolDomain: FieldHex,
    path: Omit<V1MerklePath, 'root'>,
): Promise<FieldHex> {
    if (path.siblings.length !== path.pathIndices.length || path.siblings.length < 1 ||
        path.siblings.length > V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError('Merkle path has an invalid or inconsistent depth.');
    }
    if (!Number.isSafeInteger(path.leafIndex) || path.leafIndex < 0 ||
        path.leafIndex >= 2 ** path.siblings.length) {
        throw new InvalidArgumentError('Merkle leaf index is outside the path depth.');
    }

    let current = assertFieldHex(path.leaf, 'path.leaf');
    for (let level = 0; level < path.siblings.length; level += 1) {
        const bit = path.pathIndices[level];
        if (bit !== 0 && bit !== 1) {
            throw new InvalidArgumentError(`pathIndices[${level}] must be 0 or 1.`);
        }
        if (bit !== ((path.leafIndex >> level) & 1)) {
            throw new InvariantViolationError('Merkle path bits do not encode leafIndex.');
        }
        const sibling = assertFieldHex(path.siblings[level], `path.siblings[${level}]`);
        current = await hashV1MerkleNode({
            poolDomain,
            level,
            left: bit === 0 ? current : sibling,
            right: bit === 0 ? sibling : current,
        });
    }
    return current;
}

export async function verifyV1MerklePath(
    poolDomain: FieldHex,
    path: V1MerklePath,
): Promise<boolean> {
    assertFieldHex(path.root, 'path.root');
    return (await computeV1MerkleRoot(poolDomain, path)) === path.root;
}
