import * as crypto from 'crypto';
import type { DepositNote } from '../types/note';
import type {
    MerkleTreeSnapshot,
    WithdrawalPublicInputs,
    WithdrawalWitnessBundle,
} from '../types/proof';
import { deriveNullifier } from './crypto';
import { bytesToHex, concatBytes, hexToBytes, u32LeBytes, utf8ToBytes } from './encoding';
import { generateMerkleProof, verifyMerkleProof } from './merkle';
import { generateProof, packProofForContract } from './prover';

export interface LocalWithdrawalProofResult {
    publicInputs: WithdrawalPublicInputs;
    witnessBundle: WithdrawalWitnessBundle;
    serializedWitness: Uint8Array;
    proofValid: boolean;
    snarkProof?: Uint8Array; // Real Groth16 proof
}

export interface Groth16ArtifactPaths {
    wasmPath?: string;
    zkeyPath?: string;
}

function resolveCommitment(note: DepositNote): string {
    if (!note.commitment) {
        throw new Error('Deposit note is missing commitment');
    }
    return note.commitment;
}

export function serializeMembershipWitness(bundle: WithdrawalWitnessBundle): Uint8Array {
    const sessionBytes = utf8ToBytes(bundle.sessionId);
    const commitmentBytes = hexToBytes(bundle.commitment);
    const blindingBytes = hexToBytes(bundle.blindingFactor);
    const siblingsBytes = bundle.proof.siblings.map(hexToBytes);
    const pathBytes = Uint8Array.from(
        bundle.proof.pathDirections.map(direction => (direction === 'left' ? 0 : 1)),
    );

    return concatBytes(
        u32LeBytes(sessionBytes.length),
        sessionBytes,
        commitmentBytes,
        blindingBytes,
        u32LeBytes(bundle.proof.leafIndex),
        u32LeBytes(bundle.proof.siblings.length),
        ...siblingsBytes,
        pathBytes,
    );
}

export function serializeWithdrawalPublicInputs(publicInputs: WithdrawalPublicInputs): Uint8Array {
    const root = hexToBytes(publicInputs.merkleRoot).reverse();
    const nullifier = hexToBytes(publicInputs.nullifier).reverse();
    return concatBytes(root, nullifier);
}

export function serializeWithdrawalPublicInputsHex(publicInputs: WithdrawalPublicInputs): string {
    return bytesToHex(serializeWithdrawalPublicInputs(publicInputs));
}

export async function buildWithdrawalProof(
    note: DepositNote,
    tree: MerkleTreeSnapshot,
    leafIndex: number,
    denomination: bigint,
): Promise<LocalWithdrawalProofResult> {
    const commitment = resolveCommitment(note);
    const proof = await generateMerkleProof(tree, leafIndex);
    const nullifier = await deriveNullifier(note.blindingFactor, note.sessionId);

    note.leafIndex = leafIndex;
    note.merkleRoot = tree.root;
    note.merkleProof = proof;
    note.nullifier = nullifier;

    const publicInputs: WithdrawalPublicInputs = {
        merkleRoot: tree.root,
        nullifier,
        denomination,
        outputStealthAddress: note.stealthOutputAddress,
    };

    const witnessBundle: WithdrawalWitnessBundle = {
        commitment,
        blindingFactor: note.blindingFactor,
        sessionId: note.sessionId,
        proof,
    };

    return {
        publicInputs,
        witnessBundle,
        serializedWitness: serializeMembershipWitness(witnessBundle),
        proofValid: await verifyMerkleProof(proof),
    };
}

export async function reconstructWithdrawalProof(
    note: DepositNote,
    denomination: bigint,
): Promise<LocalWithdrawalProofResult> {
    if (!note.commitment) {
        throw new Error('Deposit note is missing commitment');
    }
    if (!note.nullifier) {
        throw new Error('Deposit note is missing nullifier');
    }
    if (!note.merkleRoot) {
        throw new Error('Deposit note is missing merkleRoot');
    }
    if (!note.merkleProof) {
        throw new Error('Deposit note is missing merkleProof');
    }

    const publicInputs: WithdrawalPublicInputs = {
        merkleRoot: note.merkleRoot,
        nullifier: note.nullifier,
        denomination,
        outputStealthAddress: note.stealthOutputAddress,
    };

    const witnessBundle: WithdrawalWitnessBundle = {
        commitment: note.commitment,
        blindingFactor: note.blindingFactor,
        sessionId: note.sessionId,
        proof: note.merkleProof,
    };

    return {
        publicInputs,
        witnessBundle,
        serializedWitness: serializeMembershipWitness(witnessBundle),
        proofValid: await verifyMerkleProof(note.merkleProof),
    };
}

function resolveGroth16Artifacts(paths?: Groth16ArtifactPaths): Required<Groth16ArtifactPaths> {
    if (paths?.wasmPath && paths?.zkeyPath) {
        return {
            wasmPath: paths.wasmPath,
            zkeyPath: paths.zkeyPath,
        };
    }

    if (typeof window !== 'undefined') {
        throw new Error(
            'Browser proof generation requires explicit wasmPath and zkeyPath artifact URLs.',
        );
    }

    return {
        wasmPath: 'circuits/mixer_js/mixer.wasm',
        zkeyPath: 'circuits/mixer_final.zkey',
    };
}

export async function buildRealWithdrawalProof(
    note: DepositNote,
    tree: MerkleTreeSnapshot,
    leafIndex: number,
    denomination: bigint,
    artifacts?: Groth16ArtifactPaths,
): Promise<LocalWithdrawalProofResult> {
    const base = await buildWithdrawalProof(note, tree, leafIndex, denomination);
    
    // Prepare input for snarkjs
    // sessionId needs to be field element
    const sid = note.sessionId.startsWith('0x') 
        ? BigInt(note.sessionId) 
        : BigInt('0x' + crypto.createHash('sha256').update(note.sessionId).digest('hex')) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    const input = {
        root: BigInt(tree.root),
        nullifierHash: BigInt(base.publicInputs.nullifier),
        blindingFactor: BigInt(note.blindingFactor),
        sessionId: sid,
        pathElements: base.witnessBundle.proof.siblings.map(s => BigInt(s)),
        pathIndices: base.witnessBundle.proof.pathDirections.map(d => d === 'left' ? 0 : 1)
    };

    const { wasmPath, zkeyPath } = resolveGroth16Artifacts(artifacts);

    const { proof } = await generateProof(input, wasmPath, zkeyPath);
    const snarkProof = packProofForContract(proof);

    return {
        ...base,
        snarkProof
    };
}
