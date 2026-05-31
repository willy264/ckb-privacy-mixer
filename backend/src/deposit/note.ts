import { deriveNullifier } from 'mixer-sdk';
import type { DepositNote } from 'mixer-sdk';

export interface MintedCtNoteParams {
    sessionId: string;
    inputOutPoint: string;
    blindingFactor: string;
    secret?: string;
    nullifierSecret?: string;
    stealthOutputAddress: string;
    commitment: string;
    depositTxHash: string;
}

export async function buildMintedCtNote(params: MintedCtNoteParams): Promise<DepositNote> {
    const nullifier = await deriveNullifier(params.blindingFactor, params.sessionId);

    return {
        version: 2,
        sessionId: params.sessionId,
        inputOutPoint: params.inputOutPoint,
        blindingFactor: params.blindingFactor,
        secret: params.secret ?? params.blindingFactor,
        nullifierSecret: params.nullifierSecret ?? params.blindingFactor,
        stealthOutputAddress: params.stealthOutputAddress,
        createdAt: Date.now(),
        commitment: params.commitment as `0x${string}`,
        sessionCommitments: [params.commitment as `0x${string}`],
        nullifier: nullifier as `0x${string}`,
        leafIndex: 0,
        depositTxHash: params.depositTxHash as `0x${string}`,
        runtimeMode: 'live',
        proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1',
        registrySnapshot: {
            authority: 'direct',
        },
    };
}
