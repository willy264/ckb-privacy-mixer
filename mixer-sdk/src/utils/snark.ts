import { buildPoseidon } from 'circomlibjs';
import type { DepositNote } from '../types/note';

export class PoseidonMerkleTree {
    private poseidon: any;
    private levels: number;
    private nodes: string[][];

    constructor(poseidon: any, levels: number = 8) {
        this.poseidon = poseidon;
        this.levels = levels;
        this.nodes = Array.from({ length: levels + 1 }, () => []);
    }

    private hash(left: any, right: any): string {
        const res = this.poseidon([left, right]);
        return this.poseidon.F.toString(res);
    }

    insert(leaf: string) {
        let current = leaf;
        this.nodes[0].push(current);
        
        for (let i = 0; i < this.levels; i++) {
            const index = this.nodes[i].length - 1;
            const isLeft = index % 2 === 0;
            
            // For a prototype, we don't handle sparse updates efficiently here
            // Just return the logic for generating proof for a leaf
        }
    }

    // Simplified Merkle Proof generation for the prototype
    getProof(leaves: string[], leafIndex: number) {
        let currentLevel = leaves;
        const pathElements = [];
        const pathIndices = [];
        let index = leafIndex;

        for (let i = 0; i < this.levels; i++) {
            const levelLen = currentLevel.length;
            const isLeft = index % 2 === 0;
            const siblingIndex = isLeft ? index + 1 : index - 1;
            
            // Use a zero-hash for missing siblings
            const sibling = siblingIndex < levelLen 
                ? currentLevel[siblingIndex] 
                : "0"; 

            pathElements.push(sibling);
            pathIndices.push(isLeft ? 0 : 1);

            const nextLevel = [];
            for (let j = 0; j < levelLen; j += 2) {
                const left = currentLevel[j];
                const right = (j + 1 < levelLen) ? currentLevel[j + 1] : "0";
                nextLevel.push(this.hash(left, right));
            }
            currentLevel = nextLevel;
            index = Math.floor(index / 2);
        }

        return {
            root: currentLevel[0],
            pathElements,
            pathIndices
        };
    }
}

export async function generateMixerInput(
    blindingFactor: string,
    sessionId: string,
    leaves: string[],
    leafIndex: number
) {
    const poseidon = await buildPoseidon();
    const tree = new PoseidonMerkleTree(poseidon);

    const leafRes = poseidon([blindingFactor, sessionId]);
    const leaf = poseidon.F.toString(leafRes);
    
    const { root, pathElements, pathIndices } = tree.getProof(leaves, leafIndex);

    const nullifierHashRes = poseidon([blindingFactor, sessionId, 1]);
    const nullifierHash = poseidon.F.toString(nullifierHashRes);

    return {
        root,
        nullifierHash,
        blindingFactor,
        sessionId,
        pathElements,
        pathIndices
    };
}
