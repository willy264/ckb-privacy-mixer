import { ccc } from '@ckb-ccc/core';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('..', '.env') });
dotenv.config({ path: '.env', override: true });

async function main() {
    const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL! });
    const ownerKey = process.env.OWNER_PRIVATE_KEY!;
    const signer = new ccc.SignerCkbPrivateKey(client, ownerKey.startsWith('0x') ? ownerKey : `0x${ownerKey}`);
    
    const deployerAddress = await signer.getRecommendedAddress();
    const deployerLock = (await ccc.Address.fromString(deployerAddress, client)).script;
    
    const cccTx = ccc.Transaction.from({});

    // We must have exactly 1 input to match mint-ct.ts
    // In mint-ct.ts, we add the CT Info cell
    cccTx.addInput({ previousOutput: { txHash: '0x' + '00'.repeat(32), index: '0x0' }, since: '0x0' });

    cccTx.addOutput({ capacity: ccc.numFrom(100n * 100_000_000n), lock: deployerLock }, '0x');
    cccTx.addOutput({ capacity: ccc.numFrom(300n * 100_000_000n), lock: deployerLock }, '0x');

    await cccTx.completeInputsByCapacity(signer);

    // NOW we assign witnesses AFTER completeInputsByCapacity
    // At this point, cccTx.inputs has the original input + capacity input.
    // cccTx.witnesses[1] is probably '0x' or whatever CCC put there.
    
    const witnesses = cccTx.witnesses;
    
    witnesses[0] = ccc.hexFrom(ccc.WitnessArgs.from({
        lock: '0x' + '00'.repeat(65),
        outputType: '0x1234',
    }).toBytes());
    
    witnesses[1] = ccc.hexFrom(ccc.WitnessArgs.from({
        lock: '0x' + '00'.repeat(65), // We MUST provide a lock placeholder so Signer can sign it!
        inputType: '0x5678',
        outputType: '0x9abc',
    }).toBytes());

    cccTx.witnesses = witnesses;

    console.log("Before fee calc Witness 1:", cccTx.witnesses[1]);
    await cccTx.completeFeeBy(signer, 1000);
    console.log("After fee calc Witness 1:", cccTx.witnesses[1]);

    const signedTx = await signer.prepareTransaction(cccTx);
    console.log("Signed Witness 1:", signedTx.witnesses[1]);
    const parsed = ccc.WitnessArgs.fromBytes(ccc.bytesFrom(signedTx.witnesses[1]));
    console.log("Parsed outputType:", parsed.outputType);
}
main().catch(console.error);
