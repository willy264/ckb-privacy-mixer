import '../env.js';
import { createCtInfoTypeArgs } from './obscell.js';

const FIXTURE_INPUT = {
    previousOutput: {
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        index: '0x0',
    },
    since: '0x0',
};

async function main() {
    const actual = createCtInfoTypeArgs(FIXTURE_INPUT, 0);
    const expected = '0x95104db1ddfd88d13f9b38346ad1a273905f4d097a0aabefe0b9f6123568dd65';

    if (actual !== expected) {
        throw new Error(`Unexpected ct-info type args. Expected ${expected}, got ${actual}`);
    }

    if (actual.length !== 66) {
        throw new Error(`ct-info type args must be 66 hex chars including 0x, got ${actual.length}`);
    }

    console.log('ct-info type args self-test passed');
    console.log(`TYPE_ARGS=${actual}`);
}

main().catch((error) => {
    console.error('ct-info type args self-test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
