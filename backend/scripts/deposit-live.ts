import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { helpers, commons, config as lumosConfig } from '@ckb-lumos/lumos';
import { getRpc, getIndexer, getDeployerAddress, buildAndSendTransaction, waitForTransaction, SHANNONS, DEFAULT_FEE_RATE } from './lumos-common.js';
import { deriveCommitment, randomBlindingFactor, generateStealthAddress } from 'mixer-sdk';

async function main() {
    console.log('=== CKB Privacy Mixer: Solo Live Deposit ===');
    
    // 1. Setup Lumos
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
    const indexer = getIndexer();
    
    // 2. Load Owner Private Key
    const privateKey = process.env.OWNER_PRIVATE_KEY;
    if (!privateKey) throw new Error('OWNER_PRIVATE_KEY is missing in .env');
    const ownerAddress = getDeployerAddress(privateKey);
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
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

    const stealthLock = {
        codeHash: process.env.STEALTH_LOCK_CODE_HASH!,
        hashType: process.env.STEALTH_LOCK_HASH_TYPE! as 'type' | 'data' | 'data1',
        args: stealthOutputAddress,
    };

    // Send 100 CKB to the stealth address
    txSkeleton = txSkeleton.update('outputs', (outputs) =>
        outputs.push({
            cellOutput: {
                capacity: `0x${capacityNeeded.toString(16)}`,
                lock: stealthLock,
            },
            data: '0x',
        })
    );

    // Pay for the transaction
    txSkeleton = await commons.common.injectCapacity(
        txSkeleton,
        [ownerAddress],
        capacityNeeded,
        undefined,
        undefined,
        { config: lumosConfig.getConfig() }
    );

    txSkeleton = await commons.common.payFeeByFeeRate(
        txSkeleton,
        [ownerAddress],
        DEFAULT_FEE_RATE,
        undefined,
        { config: lumosConfig.getConfig() }
    );

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    // 5. Sign and Submit
    console.log('Submitting transaction to Pudge...');
    const { txHash, duplicated } = await buildAndSendTransaction(txSkeleton, privateKey);
    console.log(`Transaction Hash: ${txHash}`);
    
    if (!duplicated) {
        await waitForTransaction(txHash);
    }

    // 6. Generate the Deposit Note
    const sessionId = `live_solo_${Date.now().toString(16)}`;
    const blindingFactor = randomBlindingFactor();
    const commitment = await deriveCommitment(blindingFactor, sessionId);
    
    // In a solo deposit, the session size is 1.
    const leafIndex = 0;
    const sessionCommitments = [commitment];
    
    // The outpoint of the newly created cell (it was the first output in our skeleton)
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
            authority: 'direct'
        }
    };

    const notePath = path.resolve(process.cwd(), `obscell-note-${sessionId.slice(0, 8)}.json`);
    fs.writeFileSync(notePath, JSON.stringify(note, null, 2));
    
    console.log(`\n✅ Deposit confirmed!`);
    console.log(`Note saved to: ${notePath}`);
    console.log(`You can now import this note into the frontend vault to test withdrawal.`);
}

main().catch(console.error);
