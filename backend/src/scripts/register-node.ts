import { ccc } from '@ckb-ccc/core';
import { loadMixerRuntimeConfig } from 'mixer-sdk';

async function main() {
    const config = loadMixerRuntimeConfig({
        CKB_RPC_URL: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev',
        CKB_INDEXER_URL: process.env.CKB_INDEXER_URL ?? 'https://testnet.ckb.dev/indexer',
        REGISTRY_TYPE_CODE_HASH: process.env.REGISTRY_TYPE_CODE_HASH, // from deployment
        REGISTRY_TYPE_HASH_TYPE: process.env.REGISTRY_TYPE_HASH_TYPE as any,
        REGISTRY_TYPE_TX_HASH: process.env.REGISTRY_TYPE_TX_HASH,
        REGISTRY_TYPE_INDEX: process.env.REGISTRY_TYPE_INDEX,
        REGISTRY_TYPE_DEP_TYPE: process.env.REGISTRY_TYPE_DEP_TYPE as any,
    });

    const privateKey = process.env.OPERATOR_PRIVATE_KEY;
    if (!privateKey) throw new Error('OPERATOR_PRIVATE_KEY is required');
    const wakuNodeId = process.env.WAKU_NODE_ID;
    if (!wakuNodeId) throw new Error('WAKU_NODE_ID is required');
    const feePercent = process.env.FEE_PERCENT ?? '1.0';

    const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

    const tx = ccc.Transaction.from({});

    if (config.registryTypeTxHash && config.registryTypeIndex) {
        tx.addCellDeps({
            outPoint: {
                txHash: config.registryTypeTxHash,
                index: ccc.numToHex(config.registryTypeIndex)
            },
            depType: config.registryTypeDepType ?? 'code'
        });
    }

    const lock = await signer.getRecommendedAddressObj();

    // Registry Cell payload: JSON containing Waku node ID, type (relayer or coordinator), and fee
    const cellData = JSON.stringify({
        wakuNodeId,
        type: process.env.NODE_TYPE ?? 'relayer', // 'relayer' or 'coordinator'
        feePercent: parseFloat(feePercent)
    });

    // We must lock at least 100,000 CKB (from our contract)
    const capacityShannons = ccc.numFrom(100_000n * 100_000_000n);

    const typeScript = config.registryTypeCodeHash ? ccc.Script.from({
        codeHash: config.registryTypeCodeHash,
        hashType: config.registryTypeHashType ?? 'type',
        args: '0x'
    }) : undefined;

    tx.addOutput({
        capacity: capacityShannons,
        lock: lock.script,
        type: typeScript,
    }, ccc.hexFrom(Buffer.from(cellData, 'utf8')));

    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(tx);
    console.log(`Registered node on-chain. Registry cell created in tx: ${txHash}`);
}

main().catch(console.error);
