export type PoolDenomination = 10n | 100n | 1000n;

export interface Pool {
    denomination: PoolDenomination;
    activeParticipants: number;
    maxParticipants: number;
    state: 'open' | 'mixing' | 'completed';
}
