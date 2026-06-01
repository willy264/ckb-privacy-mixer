import { ccc } from '@ckb-ccc/core';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config({ path: '.env', override: true });

async function main() {
    const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL! });
    
    const relayerKey = process.env.RELAYER_PRIVATE_KEY!;
    const ownerKey = process.env.OWNER_PRIVATE_KEY!;
    
    const relayerSigner = new ccc.SignerCkbPrivateKey(client, relayerKey.startsWith('0x') ? relayerKey : `0x${relayerKey}`);
    const ownerSigner = new ccc.SignerCkbPrivateKey(client, ownerKey.startsWith('0x') ? ownerKey : `0x${ownerKey}`);
    
    const relayerAddress = await relayerSigner.getRecommendedAddress();
    const ownerAddress = await ownerSigner.getRecommendedAddress();
    
    console.log(`Relayer address: ${relayerAddress}`);
    console.log(`Owner address: ${ownerAddress}`);
    
    // Create transaction to send 1000 CKB from relayer to owner
    const tx = ccc.Transaction.from({});
    const ownerLock = (await ccc.Address.fromString(ownerAddress, client)).script;
    
    tx.addOutput({
        capacity: ccc.numFrom(10000n * 100_000_000n),
        lock: ownerLock,
    }, '0x');
    
    const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    tx.addCellDeps({
        outPoint: secp.cellDeps[0].cellDep.outPoint,
        depType: secp.cellDeps[0].cellDep.depType,
    });
    
    await tx.completeInputsByCapacity(relayerSigner);
    await tx.completeFeeBy(relayerSigner, 1000);
    
    const txHash = await relayerSigner.sendTransaction(tx);
    console.log(`Funding transaction sent! Hash: ${txHash}`);
    
    // Wait for the transaction to be committed
    console.log('Waiting for confirmation...');
    while (true) {
        const txStatus = await client.getTransaction(txHash);
        if (txStatus && txStatus.status === 'committed') {
            console.log('Transaction committed!');
            break;
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

main().catch(console.error);
