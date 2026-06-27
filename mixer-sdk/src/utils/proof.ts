import * as crypto from 'crypto';
import type { DepositNote } from '../types/note.js';
import type {
    MerkleTreeSnapshot,
    PackedGroth16Proof,
    WithdrawalPublicInputs,
    WithdrawalWitnessBundle,
} from '../types/proof.js';
import { deriveNullifierHash } from './crypto.js';
import { bytesToHex, concatBytes, hexToBytes, u32LeBytes } from './encoding.js';
import { generateMerkleProof, verifyMerkleProof } from './merkle.js';
import { generateProof, packGroth16Proof, GROTH16_PROOF_ENCODING } from './prover.js';

export interface LocalWithdrawalProofResult {
    publicInputs: WithdrawalPublicInputs;
    witnessBundle: WithdrawalWitnessBundle;
    serializedWitness: Uint8Array;
    proofValid: boolean;
    packedGroth16Proof?: PackedGroth16Proof;
    snarkProof?: Uint8Array;
    proofEncoding?: typeof GROTH16_PROOF_ENCODING;
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
    const commitmentBytes = hexToBytes(bundle.commitment);
    const secretBytes = hexToBytes(bundle.secret);
    const nullifierBytes = hexToBytes(bundle.nullifier);
    const siblingsBytes = bundle.proof.siblings.map(hexToBytes);
    const pathBytes = Uint8Array.from(
        bundle.proof.pathDirections.map(direction => (direction === 'left' ? 0 : 1)),
    );

    return concatBytes(
        commitmentBytes,
        secretBytes,
        nullifierBytes,
        u32LeBytes(bundle.proof.leafIndex),
        u32LeBytes(bundle.proof.siblings.length),
        ...siblingsBytes,
        pathBytes,
    );
}

export function serializeWithdrawalPublicInputs(publicInputs: WithdrawalPublicInputs): Uint8Array {
    const root = hexToBytes(publicInputs.merkleRoot).reverse();
    const nullifier = hexToBytes(publicInputs.nullifier).reverse();
    const recipient = hexToBytes(publicInputs.recipientHash).reverse();
    return concatBytes(root, nullifier, recipient);
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
    const nullifierHash = await deriveNullifierHash(note.nullifierSecret);

    note.leafIndex = leafIndex;
    note.merkleRoot = tree.root;
    note.merkleProof = proof;

    const recipientHash = '0x' + (BigInt(`0x${crypto.createHash('sha256').update(note.stealthOutputAddress).digest('hex')}`)
        % 21888242871839275222246405745257275088548364400416034343698204186575808495617n).toString(16).padStart(64, '0');

    const publicInputs: WithdrawalPublicInputs = {
        merkleRoot: tree.root,
        nullifier: nullifierHash,
        recipientHash,
        denomination,
        outputStealthAddress: note.stealthOutputAddress,
    };

    const witnessBundle: WithdrawalWitnessBundle = {
        commitment,
        secret: note.secret,
        nullifier: note.nullifierSecret,
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
    if (!note.nullifierSecret) {
        throw new Error('Deposit note is missing nullifierSecret');
    }
    if (!note.merkleRoot) {
        throw new Error('Deposit note is missing merkleRoot');
    }
    if (!note.merkleProof) {
        throw new Error('Deposit note is missing merkleProof');
    }

    const nullifierHash = await deriveNullifierHash(note.nullifierSecret);

    const recipientHash = '0x' + (BigInt(`0x${crypto.createHash('sha256').update(note.stealthOutputAddress).digest('hex')}`)
        % 21888242871839275222246405745257275088548364400416034343698204186575808495617n).toString(16).padStart(64, '0');

    const publicInputs: WithdrawalPublicInputs = {
        merkleRoot: note.merkleRoot,
        nullifier: nullifierHash,
        recipientHash,
        denomination,
        outputStealthAddress: note.stealthOutputAddress,
    };

    const witnessBundle: WithdrawalWitnessBundle = {
        commitment: note.commitment,
        secret: note.secret,
        nullifier: note.nullifierSecret,
        proof: note.merkleProof,
    };

    return {
        publicInputs,
        witnessBundle,
        serializedWitness: serializeMembershipWitness(witnessBundle),
        proofValid: await verifyMerkleProof(note.merkleProof),
        proofEncoding: note.proofEncoding,
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

    const input = {
        root: BigInt(tree.root),
        nullifierHash: BigInt(base.publicInputs.nullifier),
        recipient: BigInt(base.publicInputs.recipientHash),
        secret: BigInt(note.secret),
        nullifier: BigInt(note.nullifierSecret),
        pathElements: base.witnessBundle.proof.siblings.map(value => BigInt(value)),
        pathIndices: base.witnessBundle.proof.pathDirections.map(direction => (direction === 'left' ? 0 : 1)),
    };

    const { wasmPath, zkeyPath } = resolveGroth16Artifacts(artifacts);
    const { proof } = await generateProof(input, wasmPath, zkeyPath);
    const packedGroth16Proof = packGroth16Proof(proof);

    note.proofEncoding = packedGroth16Proof.encoding;

    return {
        ...base,
        packedGroth16Proof,
        snarkProof: packedGroth16Proof.bytes,
        proofEncoding: packedGroth16Proof.encoding,
    };
}
