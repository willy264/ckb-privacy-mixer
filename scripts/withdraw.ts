/**
 * withdraw.ts
 * CLI script to withdraw from a completed mixing session.
 * Usage: npx tsx scripts/withdraw.ts
 */
import {
    clearSpentNullifiers,
    getSpentNullifiers,
    withdrawMix,
} from '../mixer-sdk/src/operations/withdraw';

async function main() {
    clearSpentNullifiers();
    console.log('Running Phase 3 nullifier withdrawal simulation...');
    const mockNote = {
        sessionId: 'session_abc123',
        inputOutPoint: '0xdeadbeef',
        blindingFactor: '0x' + 'f'.repeat(64),
        stealthOutputAddress: 'ckt1_stealth_dest',
        createdAt: Date.now()
    };

    try {
        const txHash = await withdrawMix(mockNote);
        console.log('Withdrawal submitted:', txHash);
        console.log('Registered nullifiers:', getSpentNullifiers().length);

        console.log('Replaying the same note to verify double-spend protection...');
        await withdrawMix(mockNote);
    } catch (e: any) {
        console.log(e.message);
    }
}

main();
