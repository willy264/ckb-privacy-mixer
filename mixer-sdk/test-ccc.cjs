const { ccc } = require('@ckb-ccc/core');
const { serializeWitnessArgs } = require('@nervosnetwork/ckb-sdk-utils');

async function test() {
    const client = new ccc.ClientPublicTestnet({url: 'https://testnet.ckbapp.dev/rpc'});
    const privateKey = '0x7c1c71855ac2ad2fa5af4638565030379f606899a11eb9ab7284f3ccafcf3011';
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
    const address = await signer.getRecommendedAddress();

    const tx = ccc.Transaction.from({});
    
    // Provide a completely empty script instead of trying to look up KnownScript
    tx.addInput({
        previousOutput: { txHash: '0x0000000000000000000000000000000000000000000000000000000000000001', index: 0 },
        cellOutput: { 
            lock: address.script, 
            capacity: ccc.numFrom(10000000000) 
        }
    });
    
    // Add the exact lock that secp256k1 expects to be replaced
    const proofWitness = serializeWitnessArgs({
        lock: '0x' + '00'.repeat(65),
        inputType: '0x',
        outputType: '0x12345678'
    });
    tx.witnesses = [proofWitness];
    
    console.log("Before sign lock size:", ccc.WitnessArgs.fromBytes(tx.witnesses[0]).lock.length);
    
    try {
        const signed = await signer.signTransaction(tx);
        const signedWa = ccc.WitnessArgs.fromBytes(signed.witnesses[0]);
        console.log("After sign lock:", signedWa.lock);
        console.log("After sign lock size:", signedWa.lock.length);
        console.log("After sign outputType:", signedWa.outputType);
    } catch(e) {
        console.error("Error signing:", e);
    }
}

test().catch(console.error);
