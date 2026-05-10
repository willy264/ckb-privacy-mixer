/**
 * deposit.ts
 * CLI script to prepare a deposit note through the SDK session flow.
 * Usage: npx tsx scripts/deposit.ts
 */
import { joinMix } from '../mixer-sdk/src/operations/deposit';

async function main() {
    const ctInputCell = {
        outPoint: `0x${'a'.repeat(64)}`,
        amount: 100n,
    };
    const stealthOutputAddress = 'ckt1_stealth_my_dest_address';
    const privateKey = process.env.OWNER_PRIVATE_KEY ?? '0x_dev_private_key';

    console.log('Joining a 100 CT mixing session...');
    try {
        const result = await joinMix({
            ctInputCell,
            stealthOutputAddress,
            privateKey,
            runtimeMode: 'preview',
        });
        console.log('Session:', result.sessionId);
        console.log('Status:', result.status);
        console.log('Tx Hash:', result.confirmedTxHash);
        console.log('Leaf Index:', result.leafIndex);
        console.log('Commitments:', result.participantCommitments.length);
    } catch (error) {
        console.error('Deposit failed:', error);
    }
}

main();
