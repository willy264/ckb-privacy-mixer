import * as crypto from 'crypto';
import type {
    HexString,
    MerkleDirection,
    MerkleProof,
    MerkleTreeSnapshot,
} from '../types/proof';
import { bytesToHex, concatBytes, hexToBytes } from './encoding';

function sha256Bytes(payload: Uint8Array): Uint8Array {
    return hexToBytes(crypto.createHash('sha256').update(payload).digest('hex'));
}

export function hashLeaf(leaf: HexString): HexString {
    return bytesToHex(sha256Bytes(concatBytes(Uint8Array.from([0]), hexToBytes(leaf))));
}

export function hashNode(left: HexString, right: HexString): HexString {
    return bytesToHex(
        sha256Bytes(concatBytes(Uint8Array.from([1]), hexToBytes(left), hexToBytes(right))),
    );
}

export function buildMerkleTree(leaves: HexString[]): MerkleTreeSnapshot {
    const leafHashes = leaves.map(hashLeaf);

    if (leafHashes.length === 0) {
        const emptyRoot = bytesToHex(sha256Bytes(Uint8Array.from([255])));
        return {
            leaves,
            leafHashes,
            levels: [[emptyRoot]],
            root: emptyRoot,
        };
    }

    const levels: HexString[][] = [leafHashes];
    while (levels[levels.length - 1].length > 1) {
        const currentLevel = levels[levels.length - 1];
        const nextLevel: HexString[] = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] ?? currentLevel[i];
            nextLevel.push(hashNode(left, right));
        }

        levels.push(nextLevel);
    }

    return {
        leaves,
        leafHashes,
        levels,
        root: levels[levels.length - 1][0],
    };
}

export function generateMerkleProof(
    tree: MerkleTreeSnapshot,
    leafIndex: number,
): MerkleProof {
    if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
        throw new Error(`Leaf index ${leafIndex} is out of bounds for tree size ${tree.leaves.length}`);
    }

    const siblings: HexString[] = [];
    const pathDirections: MerkleDirection[] = [];
    let index = leafIndex;

    for (let levelIndex = 0; levelIndex < tree.levels.length - 1; levelIndex += 1) {
        const level = tree.levels[levelIndex];
        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;
        const sibling = level[siblingIndex] ?? level[index];

        siblings.push(sibling);
        pathDirections.push(isRightNode ? 'right' : 'left');
        index = Math.floor(index / 2);
    }

    return {
        leaf: tree.leaves[leafIndex],
        leafHash: tree.leafHashes[leafIndex],
        leafIndex,
        siblings,
        pathDirections,
        root: tree.root,
    };
}

export function verifyMerkleProof(proof: MerkleProof): boolean {
    let current = proof.leafHash;

    for (let i = 0; i < proof.siblings.length; i += 1) {
        const sibling = proof.siblings[i];
        const direction = proof.pathDirections[i];
        current = direction === 'left'
            ? hashNode(current, sibling)
            : hashNode(sibling, current);
    }

    return current === proof.root;
}
