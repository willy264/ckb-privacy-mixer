import { buildPoseidon } from 'circomlibjs';
import type {
    HexString,
    MerkleDirection,
    MerkleProof,
    MerkleTreeSnapshot,
} from '../types/proof.js';
import { normalizeHex } from './encoding.js';

let poseidon: any;

async function getPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
    }
    return poseidon;
}

export function hashLeaf(leaf: HexString): HexString {
    // In our circuit, the leaf (commitment) is already a Poseidon hash
    // and is used directly in the MerkleTreeChecker without another hash layer.
    return leaf;
}

export async function hashNode(left: HexString, right: HexString): Promise<HexString> {
    const p = await getPoseidon();
    const l = BigInt('0x' + normalizeHex(left));
    const r = BigInt('0x' + normalizeHex(right));
    const hash = p([l, r]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}

export async function getEmptyValues(levels: number): Promise<HexString[]> {
    const emptyValues: HexString[] = ['0x0000000000000000000000000000000000000000000000000000000000000000'];
    for (let i = 0; i < levels; i++) {
        const h = await hashNode(emptyValues[i], emptyValues[i]);
        emptyValues.push(h);
    }
    return emptyValues;
}

export async function buildMerkleTree(leaves: HexString[]): Promise<MerkleTreeSnapshot> {
    const leafHashes = leaves.map(hashLeaf);
    const levels: HexString[][] = [leafHashes];
    const treeLevels = 20; // Fixed for our circuit

    // Precompute empty hashes for each level
    const emptyValues = await getEmptyValues(treeLevels);

    // Build the tree up to fixed levels
    for (let levelIndex = 0; levelIndex < treeLevels; levelIndex++) {
        const currentLevel = levels[levelIndex];
        const nextLevel: HexString[] = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] ?? emptyValues[levelIndex];
            nextLevel.push(await hashNode(left, right));
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

export async function generateMerkleProof(
    tree: MerkleTreeSnapshot,
    leafIndex: number,
): Promise<MerkleProof> {
    if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
        throw new Error(`Leaf index ${leafIndex} is out of bounds for tree size ${tree.leaves.length}`);
    }

    const treeLevels = 20;
    const emptyValues = await getEmptyValues(treeLevels);
    const siblings: HexString[] = [];
    const pathDirections: MerkleDirection[] = [];
    let index = leafIndex;

    for (let levelIndex = 0; levelIndex < tree.levels.length - 1; levelIndex += 1) {
        const level = tree.levels[levelIndex];
        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;
        const sibling = level[siblingIndex] ?? emptyValues[levelIndex];

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

export async function verifyMerkleProof(proof: MerkleProof): Promise<boolean> {
    let current = proof.leafHash;

    for (let i = 0; i < proof.siblings.length; i += 1) {
        const sibling = proof.siblings[i];
        const direction = proof.pathDirections[i];
        current = direction === 'left'
            ? await hashNode(current, sibling)
            : await hashNode(sibling, current);
    }

    return current === proof.root;
}
