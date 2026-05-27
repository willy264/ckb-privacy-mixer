import type { Cell, DepositResult } from '../core/session';

export interface JoinMixParams {
    ctInputCell: Cell;
    stealthOutputAddress: string;
    privateKey: string;
    runtimeMode?: 'preview' | 'live';
    sessionMinParticipants?: number;
}

export async function joinMix(params: JoinMixParams): Promise<DepositResult> {
    void params;
    throw new Error(
        'joinMix is disabled. This repository no longer fabricates preview deposit sessions or mock notes. ' +
        'Wire a real CKB CT deposit pipeline before enabling deposits again.',
    );
}
