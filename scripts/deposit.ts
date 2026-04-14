/**
 * deposit.ts
 * CLI script to deposit into a mixing session.
 * Usage: npx tsx scripts/deposit.ts
 */
import { joinMix } from '../mixer-sdk/src/operations/deposit';

async function main() {
    const ctInputCell = {
        outPoint: '0x' + 'a'.repeat(64),
        amount: 100n
    };
    const stealthOutputAddress = 'ckt1_stealth_my_dest_address';
    const privateKey = process.env.OWNER_PRIVATE_KEY ?? '0x_dev_private_key';

    console.log('Joining a 100 CT mixing session...');
    try {
        const txHash = await joinMix({ ctInputCell, stealthOutputAddress, privateKey });
        console.log('Success! Transaction hash:', txHash);
    } catch (e) {
        console.error('Deposit failed:', e);
    }
}

main();
