import { ccc } from '@ckb-ccc/core';
import { loadMixerRuntimeConfig } from 'mixer-sdk/legacy';

async function main() {
    const config = loadMixerRuntimeConfig({
        CKB_RPC_URL: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev',
        CKB_INDEXER_URL: process.env.CKB_INDEXER_URL ?? 'https://testnet.ckb.dev/indexer',
        MIXER_POOL_CODE_HASH: process.env.MIXER_POOL_CODE_HASH,
        MIXER_POOL_HASH_TYPE: process.env.MIXER_POOL_HASH_TYPE,
        NULLIFIER_TYPE_CODE_HASH: process.env.NULLIFIER_TYPE_CODE_HASH,
        NULLIFIER_TYPE_HASH_TYPE: process.env.NULLIFIER_TYPE_HASH_TYPE,
        ZK_MEMBERSHIP_TYPE_CODE_HASH: process.env.ZK_MEMBERSHIP_TYPE_CODE_HASH,
        ZK_MEMBERSHIP_TYPE_HASH_TYPE: process.env.ZK_MEMBERSHIP_TYPE_HASH_TYPE,
        STEALTH_LOCK_CODE_HASH: process.env.STEALTH_LOCK_CODE_HASH,
        STEALTH_LOCK_HASH_TYPE: process.env.STEALTH_LOCK_HASH_TYPE,
        CT_TOKEN_TYPE_CODE_HASH: process.env.CT_TOKEN_TYPE_CODE_HASH,
        CT_TOKEN_TYPE_HASH_TYPE: process.env.CT_TOKEN_TYPE_HASH_TYPE,
    });
    const registryTypeCodeHash = process.env.REGISTRY_TYPE_CODE_HASH;
    const registryTypeHashType = process.env.REGISTRY_TYPE_HASH_TYPE as 'data' | 'data1' | 'type' | undefined;
    const registryTypeTxHash = process.env.REGISTRY_TYPE_TX_HASH;
    const registryTypeIndex = process.env.REGISTRY_TYPE_INDEX;
    const registryTypeDepType = process.env.REGISTRY_TYPE_DEP_TYPE as 'code' | 'depGroup' | undefined;

    const privateKey = process.env.OPERATOR_PRIVATE_KEY;
    if (!privateKey) throw new Error('OPERATOR_PRIVATE_KEY is required');
    const wakuNodeId = process.env.WAKU_NODE_ID;
    if (!wakuNodeId) throw new Error('WAKU_NODE_ID is required');
    const feePercent = process.env.FEE_PERCENT ?? '1.0';

    const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

    const tx = ccc.Transaction.from({});

    if (registryTypeTxHash && registryTypeIndex) {
        tx.addCellDeps({
            outPoint: {
                txHash: registryTypeTxHash,
                index: ccc.numToHex(registryTypeIndex)
            },
            depType: registryTypeDepType ?? 'code'
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

    const typeScript = registryTypeCodeHash ? ccc.Script.from({
        codeHash: registryTypeCodeHash,
        hashType: registryTypeHashType ?? 'type',
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
