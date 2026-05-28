import '../env.js';
import { buildAndSendTransaction, getIndexer, initializePudge, requiredEnv, resolveWorkingEndpointPair, waitForTransaction } from './lumos.js';
import { buildGenesisCtInfoTransaction, MINTABLE } from './obscell.js';

async function main() {
    initializePudge();
    const endpoint = await resolveWorkingEndpointPair();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const ctInfoCodeHash = requiredEnv('CT_INFO_TYPE_CODE_HASH');
    const ctInfoHashType = requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const supplyCap = BigInt(process.env.CT_INFO_SUPPLY_CAP ?? '1000000');

    const { txSkeleton, typeArgs, typeScriptHash, data } = await buildGenesisCtInfoTransaction({
        privateKey,
        ctInfoCodeHash,
        ctInfoHashType,
        indexer: getIndexer(endpoint),
        ctInfoDep: {
            txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'),
            index: requiredEnv('CT_INFO_TYPE_INDEX'),
            depType: 'code',
        },
        supplyCap,
        flags: MINTABLE,
    });

    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    await waitForTransaction(txHash);

    console.log('ct-info bootstrap committed');
    console.log(`CT_INFO_CELL_TX_HASH=${txHash}`);
    console.log('CT_INFO_CELL_INDEX=0x0');
    console.log(`CT_INFO_TYPE_ARGS=${typeArgs}`);
    console.log(`CT_INFO_SCRIPT_HASH=${typeScriptHash}`);
    console.log(`CT_INFO_INIT_DATA=${data}`);
}

main().catch((error) => {
    console.error('bootstrap-ct-info failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
