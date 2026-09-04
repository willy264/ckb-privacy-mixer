import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, type FieldHex } from '../crypto/field.js';
import { V1_MERKLE_DEPTH } from '../protocol/pool.js';
import { getV1EmptyRoots, hashV1MerkleNode } from './roots.js';

export interface V1MerkleFrontierSnapshot {
    readonly depth: number;
    readonly nextLeafIndex: number;
    readonly root: FieldHex;
    readonly frontier: readonly (FieldHex | null)[];
}

export class V1MerkleFrontier {
    private readonly nodes: Array<FieldHex | null>;

    private constructor(
        public readonly poolDomain: FieldHex,
        public readonly depth: number,
        private readonly emptyRoots: readonly FieldHex[],
        private nextIndex: number,
        private currentRoot: FieldHex,
    ) {
        this.nodes = Array.from({ length: depth }, () => null);
    }

    static async create(
        poolDomain: FieldHex,
        depth = V1_MERKLE_DEPTH,
    ): Promise<V1MerkleFrontier> {
        assertFieldHex(poolDomain, 'poolDomain');
        if (!Number.isSafeInteger(depth) || depth < 1 || depth > V1_MERKLE_DEPTH) {
            throw new InvalidArgumentError(`Merkle depth must be between 1 and ${V1_MERKLE_DEPTH}.`);
        }
        const emptyRoots = await getV1EmptyRoots(poolDomain, depth);
        return new V1MerkleFrontier(poolDomain, depth, emptyRoots, 0, emptyRoots[depth]);
    }

    async append(leaf: FieldHex): Promise<{ readonly leafIndex: number; readonly root: FieldHex }> {
        if (this.nextIndex >= 2 ** this.depth) {
            throw new InvariantViolationError('Merkle frontier is full.');
        }
        let current = assertFieldHex(leaf, 'leaf');
        const leafIndex = this.nextIndex;
        let occupied = leafIndex;
        let level = 0;

        while ((occupied & 1) === 1) {
            const left = this.nodes[level];
            if (!left) {
                throw new InvariantViolationError(`Merkle frontier is missing level ${level}.`);
            }
            current = await hashV1MerkleNode({
                poolDomain: this.poolDomain,
                level,
                left,
                right: current,
            });
            this.nodes[level] = null;
            occupied = Math.floor(occupied / 2);
            level += 1;
        }

        this.nextIndex += 1;
        if (level === this.depth) {
            this.currentRoot = current;
        } else {
            this.nodes[level] = current;
            this.currentRoot = await this.computePaddedRoot();
        }
        return Object.freeze({ leafIndex, root: this.currentRoot });
    }

    snapshot(): V1MerkleFrontierSnapshot {
        return Object.freeze({
            depth: this.depth,
            nextLeafIndex: this.nextIndex,
            root: this.currentRoot,
            frontier: Object.freeze([...this.nodes]),
        });
    }

    private async computePaddedRoot(): Promise<FieldHex> {
        let current = this.emptyRoots[0];
        let occupied = this.nextIndex;
        for (let level = 0; level < this.depth; level += 1) {
            if ((occupied & 1) === 1) {
                const left = this.nodes[level];
                if (!left) {
                    throw new InvariantViolationError(`Merkle frontier is missing level ${level}.`);
                }
                current = await hashV1MerkleNode({
                    poolDomain: this.poolDomain,
                    level,
                    left,
                    right: current,
                });
            } else {
                current = await hashV1MerkleNode({
                    poolDomain: this.poolDomain,
                    level,
                    left: current,
                    right: this.emptyRoots[level],
                });
            }
            occupied = Math.floor(occupied / 2);
        }
        return current;
    }
}
