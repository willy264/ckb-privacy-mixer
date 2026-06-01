import '../env.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { deriveCommitment } from 'mixer-sdk';
import { ccc } from '@ckb-ccc/core';
import { requiredEnv, resolveWorkingEndpointPair, waitForTransaction } from './ccc.js';
import { createCtInfoData, parseCtInfoData } from './obscell.js';

const execFileAsync = promisify(execFile);
const MINT_AMOUNT = 100n;
const CT_TOKEN_OUTPUT_CAPACITY = 300n * 100_000_000n;

interface MintHelperOutput {
    amount: number;
    mint_commitment_hex: string;
    commitment_hex: string;
    blinding_factor_hex: string;
    range_proof_hex: string;
}

async function runMintHelper(amount: bigint): Promise<MintHelperOutput> {
    const { stdout } = await execFileAsync(
        'cargo',
        ['run', '-q', '-p', 'ct-mint-helper', '--', amount.toString(), '--zero-blinding'],
        { cwd: process.cwd() },
    );
    return JSON.parse(stdout) as MintHelperOutput;
}

// fetchLiveCell removed

async function findLiveCtInfoCell(client: ccc.Client, lockScript: ccc.Script, typeScript: ccc.Script) {
    for await (const cell of client.findCells({ script: lockScript, scriptType: 'lock', scriptSearchMode: 'exact' })) {
        if (!cell.cellOutput.type || !cell.cellOutput.type.eq(typeScript)) {
            continue;
        }
        return cell;
    }
    return null;
}

function createCtInfoScript(ctInfoCodeHash: string, ctInfoHashType: 'data' | 'data1' | 'type', args: string) {
    return ccc.Script.from({
        codeHash: ctInfoCodeHash,
        hashType: ctInfoHashType,
        args,
    });
}

function createCtTokenScript(ctTokenCodeHash: string, ctTokenHashType: 'data' | 'data1' | 'type', ctInfoScriptHash: string) {
    return ccc.Script.from({
        codeHash: ctTokenCodeHash,
        hashType: ctTokenHashType,
        args: ctInfoScriptHash,
    });
}

async function main() {
    const endpoint = await resolveWorkingEndpointPair();

    const client = new ccc.ClientPublicTestnet({ url: endpoint.rpcUrl });

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const deployerAddress = await signer.getRecommendedAddress();
    const recipientAddress = process.argv[2] ?? deployerAddress;
    
    const ctInfoCodeHash = requiredEnv('CT_INFO_TYPE_CODE_HASH');
    const ctInfoHashType = requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const ctTokenCodeHash = requiredEnv('CT_TOKEN_TYPE_CODE_HASH');
    const ctTokenHashType = requiredEnv('CT_TOKEN_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const ctInfoArgs = requiredEnv('CT_INFO_TYPE_ARGS');

    const deployerLock = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160).then(s => ccc.Script.from({
        codeHash: s.codeHash,
        hashType: s.hashType,
        args: ccc.hexFrom(signer.publicKey).slice(0, 42) // Wait, we can just use ccc.Address
    }));
    // Actually we can get deployer lock script from signer
    const deployerLockObj = (await ccc.Address.fromString(deployerAddress, client)).script;

    const ctInfoScript = createCtInfoScript(ctInfoCodeHash, ctInfoHashType, ctInfoArgs);
    const liveCtInfoCellRef = await findLiveCtInfoCell(client, deployerLockObj, ctInfoScript);
    if (!liveCtInfoCellRef) {
        throw new Error(`Unable to locate the live ct-info state cell for args ${ctInfoArgs}.`);
    }

    const ctInfoDataHex = await client.getCell(liveCtInfoCellRef.outPoint).then(c => c?.outputData);
    if (!ctInfoDataHex) throw new Error('CT info cell data not found');
    const ctInfoData = parseCtInfoData(ctInfoDataHex);

    const newSupply = ctInfoData.totalSupply + MINT_AMOUNT;
    const updatedCtInfoData = createCtInfoData({
        totalSupply: newSupply,
        supplyCap: ctInfoData.supplyCap,
        flags: ctInfoData.flags,
        reserved: ctInfoData.reserved,
    });

    const helper = await runMintHelper(MINT_AMOUNT);

    const ctInfoScriptHash = ctInfoScript.hash();
    const ctTokenScript = createCtTokenScript(ctTokenCodeHash, ctTokenHashType, ctInfoScriptHash);
    const recipientLock = (await ccc.Address.fromString(recipientAddress, client)).script;

    const cccTx = ccc.Transaction.from({});

    cccTx.addInput({
        previousOutput: liveCtInfoCellRef.outPoint,
        since: '0x0',
    });

    cccTx.addOutput({
        capacity: ccc.numFrom(liveCtInfoCellRef.cellOutput.capacity),
        lock: liveCtInfoCellRef.cellOutput.lock,
        type: ctInfoScript,
    }, ccc.hexFrom(updatedCtInfoData));

    cccTx.addOutput({
        capacity: ccc.numFrom(CT_TOKEN_OUTPUT_CAPACITY),
        lock: recipientLock,
        type: ctTokenScript,
    }, ccc.hexFrom(`${helper.commitment_hex}${'00'.repeat(32)}`.replace(/^0x0x/, '0x')));

    const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    cccTx.addCellDeps({
        outPoint: secp.cellDeps[0].cellDep.outPoint,
        depType: secp.cellDeps[0].cellDep.depType,
    });
    
    cccTx.addCellDeps({
        outPoint: {
            txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'),
            index: ccc.numToHex(requiredEnv('CT_INFO_TYPE_INDEX')),
        },
        depType: 'code',
    });
    
    cccTx.addCellDeps({
        outPoint: {
            txHash: requiredEnv('CT_TOKEN_TYPE_TX_HASH'),
            index: ccc.numToHex(requiredEnv('CT_TOKEN_TYPE_INDEX')),
        },
        depType: 'code',
    });
    
    cccTx.addCellDeps({
        outPoint: {
            txHash: requiredEnv('STEALTH_LOCK_TX_HASH'),
            index: ccc.numToHex(requiredEnv('STEALTH_LOCK_INDEX')),
        },
        depType: 'code',
    });

    await cccTx.completeInputsByCapacity(signer);

    // Witness structure for mint
    const witnesses: ccc.Hex[] = [...cccTx.witnesses];
    
    // We need to build the WitnessArgs correctly
    // The ct-info witness uses outputType
    const ctInfoWitnessObj = {
        lock: '0x' + '00'.repeat(65),
        inputType: '0x',
        outputType: helper.mint_commitment_hex
    };
    
    // The ct-token witness uses inputType & outputType
    // Must include a lock placeholder since this index corresponds to the capacity input added by completeInputsByCapacity
    const ctTokenWitnessObj = {
        lock: '0x' + '00'.repeat(65),
        inputType: helper.mint_commitment_hex,
        outputType: helper.range_proof_hex
    };

    // Serialize WitnessArgs properly
    witnesses[0] = ccc.hexFrom(ccc.WitnessArgs.from(ctInfoWitnessObj).toBytes());
    witnesses[1] = ccc.hexFrom(ccc.WitnessArgs.from(ctTokenWitnessObj).toBytes());

    cccTx.witnesses = witnesses;

    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    await waitForTransaction(txHash);

    const outputOutPoint = `${txHash}:0x1`;
    const sessionId = `ct_mint_${txHash.slice(2, 18)}`;
    
    // The transitional/legacy implementation used sessionId as the nullifier secret.
    // If it's a string like 'ct_mint_...', we must hash it to a hex field element first.
    const cryptoModule = await import('crypto');
    const sessionHex = sessionId.startsWith('0x') 
        ? sessionId 
        : `0x${cryptoModule.createHash('sha256').update(sessionId).digest('hex')}`;
    
    const commitment = await deriveCommitment(helper.blinding_factor_hex, sessionHex);

    console.log('Mint committed on Pudge.');
    console.log(`MINT_TX_HASH=${txHash}`);
    console.log(`CT_INFO_CELL_TX_HASH=${txHash}`);
    console.log('CT_INFO_CELL_INDEX=0x0');
    console.log(`RECIPIENT_LOCK_ARGS=${recipientLock.args}`);
    console.log(`CT_INFO_SCRIPT_HASH=${ctInfoScriptHash}`);
    console.log(`CT_NOTE_COMMITMENT=${helper.commitment_hex}`);
    console.log(`CT_NOTE_BLINDING_FACTOR=${helper.blinding_factor_hex}`);
    console.log(`CT_NOTE_AMOUNT=${helper.amount}`);
    console.log(`CT_NOTE_SESSION_ID=${sessionId}`);
    console.log(`CT_NOTE_INPUT_OUT_POINT=${outputOutPoint}`);
    console.log(`CT_NOTE_TREE_COMMITMENT=${commitment}`);
}

main().catch((error) => {
    console.error('mint-ct failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
