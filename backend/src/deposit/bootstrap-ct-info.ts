import '../env.js';
import { requiredEnv, resolveWorkingEndpointPair, waitForTransaction } from './ccc.js';
import { buildGenesisCtInfoTransaction, MINTABLE } from './obscell.js';
import { ccc } from '@ckb-ccc/core';

async function main() {
    const endpoint = await resolveWorkingEndpointPair();
    const client = new ccc.ClientPublicTestnet({ url: endpoint.rpcUrl });

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const ctInfoCodeHash = requiredEnv('CT_INFO_TYPE_CODE_HASH');
    const ctInfoHashType = requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const supplyCap = BigInt(process.env.CT_INFO_SUPPLY_CAP ?? '1000000');

    const { cccTx, typeArgs, typeScriptHash, data } = await buildGenesisCtInfoTransaction({
        privateKey,
        ctInfoCodeHash,
        ctInfoHashType,
        client,
        ctInfoDep: {
            txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'),
            index: requiredEnv('CT_INFO_TYPE_INDEX'),
            depType: 'code',
        },
        supplyCap,
        flags: MINTABLE,
    });

    const signer = new ccc.SignerCkbPrivateKey(client, privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const txHash = await signer.sendTransaction(cccTx);
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
