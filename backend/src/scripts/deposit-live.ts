import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ccc } from '@ckb-ccc/core';
import { getClient, getSigner, waitForTransaction, SHANNONS } from './ccc-common.js';
import { deriveCommitment, randomBlindingFactor, generateStealthAddress } from 'mixer-sdk/legacy';

async function main() {
    console.log('=== CKB Privacy Mixer: Solo Live Deposit ===');
    
    // 1. Setup CCC
    const client = getClient();
    
    // 2. Load Owner Private Key
    const privateKey = process.env.OWNER_PRIVATE_KEY;
    if (!privateKey) throw new Error('OWNER_PRIVATE_KEY is missing in .env');
    const signer = getSigner(client, privateKey);
    const ownerAddress = await signer.getRecommendedAddress();
    console.log(`Funder Address: ${ownerAddress}`);

    // 3. Generate a deposit configuration
    const denomination = 100n;
    const capacityNeeded = denomination * SHANNONS;
    
    // We mock the user's JoyID wallet address for the stealth address generation.
    // In production, this would be their actual JoyID address.
    const mockUserAddress = 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqw6u538u92c3vp5985r6cgtgzfe34hv6qcpm6hue';
    const stealthOutputAddress = generateStealthAddress(mockUserAddress);
    
    console.log(`Stealth Output: ${stealthOutputAddress}`);
    console.log(`Amount: ${denomination} CT (${capacityNeeded} shannons)`);

    // 4. Build the real CKB transaction
    const stealthAddressObj = await ccc.Address.fromString(stealthOutputAddress, client);
    
    const cccTx = ccc.Transaction.from({});

    // Send 100 CKB to the stealth address
    cccTx.addOutput({
        capacity: ccc.numFrom(capacityNeeded),
        lock: stealthAddressObj.script,
    }, '0x');

    // Let CCC gather inputs and pay fee
    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    // 5. Sign and Submit
    console.log('Submitting transaction to Pudge...');
    const txHash = await signer.sendTransaction(cccTx);
    console.log(`Transaction Hash: ${txHash}`);
    
    await waitForTransaction(txHash);

    // 6. Generate the Deposit Note
    const sessionId = `live_solo_${Date.now().toString(16)}`;
    const blindingFactor = randomBlindingFactor();
    const commitment = await deriveCommitment(blindingFactor, sessionId);
    
    // In a solo deposit, the session size is 1.
    const leafIndex = 0;
    const sessionCommitments = [commitment];
    
    // The outpoint of the newly created cell (it was the first output)
    const outPoint = `${txHash}_0x0`;
    
    const note = {
        version: 2,
        sessionId,
        inputOutPoint: outPoint,
        blindingFactor,
        stealthOutputAddress,
        createdAt: Date.now(),
        commitment,
        sessionCommitments,
        leafIndex,
        depositTxHash: txHash,
        runtimeMode: 'live',
        proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1',
        denomination: Number(denomination),
        registrySnapshot: {
            authority: 'operator-registry-lock'
        }
    };

    const notePath = path.resolve(process.cwd(), `obscell-note-${sessionId.slice(0, 8)}.json`);
    fs.writeFileSync(notePath, JSON.stringify(note, null, 2));
    
    console.log(`\n✅ Deposit confirmed!`);
    console.log(`Note saved to: ${notePath}`);
    console.log(`You can now import this note into the frontend vault to test withdrawal.`);
}

main().catch(console.error);
