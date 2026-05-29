import '../env.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { deriveCommitment } from 'mixer-sdk/dist/utils/crypto.js';
import { helpers, commons, config as lumosConfig, RPC } from '@ckb-lumos/lumos';
import { scriptToHash, serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';
import { buildAndSendTransaction, getDeployerAddress, getDeployerLock, getIndexer, initializePudge, requiredEnv, resolveWorkingEndpointPair, waitForTransaction } from './lumos.js';
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

async function fetchLiveCell(rpc: RPC, txHash: string, index: string) {
    const liveCell = await rpc.getLiveCell(
        {
            txHash,
            index,
        } as any,
        true,
    );

    if (!liveCell.cell || liveCell.status !== 'live') {
        throw new Error(`Live cell ${txHash}:${index} not found on-chain.`);
    }

    return liveCell as typeof liveCell & { cell: NonNullable<typeof liveCell.cell> };
}

async function findLiveCtInfoCell(lockScript: any, typeScript: any) {
    const endpoint = await resolveWorkingEndpointPair();
    const collector = getIndexer(endpoint).collector({
        lock: lockScript,
        type: typeScript,
    } as any);

    for await (const cell of collector.collect()) {
        if (!cell.outPoint) {
            continue;
        }
        return cell;
    }

    return null;
}

function createCtInfoScript(ctInfoCodeHash: string, ctInfoHashType: 'data' | 'data1' | 'type', args: string) {
    return {
        codeHash: ctInfoCodeHash,
        hashType: ctInfoHashType,
        args,
    };
}

function createCtTokenScript(ctTokenCodeHash: string, ctTokenHashType: 'data' | 'data1' | 'type', ctInfoScriptHash: string) {
    return {
        codeHash: ctTokenCodeHash,
        hashType: ctTokenHashType,
        args: ctInfoScriptHash,
    };
}

async function main() {
    initializePudge();
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
    const endpoint = await resolveWorkingEndpointPair();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const recipientAddress = process.argv[2] ?? getDeployerAddress(privateKey);
    const ctInfoCodeHash = requiredEnv('CT_INFO_TYPE_CODE_HASH');
    const ctInfoHashType = requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const ctTokenCodeHash = requiredEnv('CT_TOKEN_TYPE_CODE_HASH');
    const ctTokenHashType = requiredEnv('CT_TOKEN_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const ctInfoArgs = requiredEnv('CT_INFO_TYPE_ARGS');

    const deployerLock = getDeployerLock(privateKey);
    const ctInfoScript = createCtInfoScript(ctInfoCodeHash, ctInfoHashType, ctInfoArgs);
    const liveCtInfoCellRef = await findLiveCtInfoCell(deployerLock, ctInfoScript);
    if (!liveCtInfoCellRef?.outPoint) {
        throw new Error(`Unable to locate the live ct-info state cell for args ${ctInfoArgs}.`);
    }

    const rpc = new RPC(endpoint.rpcUrl);
    const ctInfoCellTxHash = liveCtInfoCellRef.outPoint.txHash;
    const ctInfoCellIndex = liveCtInfoCellRef.outPoint.index;
    const liveCtInfoCell = await fetchLiveCell(rpc, ctInfoCellTxHash, ctInfoCellIndex);
    const ctInfoData = parseCtInfoData(liveCtInfoCell.cell.data.content);

    const newSupply = ctInfoData.totalSupply + MINT_AMOUNT;
    const updatedCtInfoData = createCtInfoData({
        totalSupply: newSupply,
        supplyCap: ctInfoData.supplyCap,
        flags: ctInfoData.flags,
        reserved: ctInfoData.reserved,
    });

    const helper = await runMintHelper(MINT_AMOUNT);

    const ctInfoScriptHash = scriptToHash(ctInfoScript as any);
    const ctTokenScript = createCtTokenScript(ctTokenCodeHash, ctTokenHashType, ctInfoScriptHash);
    const recipientLock = helpers.parseAddress(recipientAddress, { config: lumosConfig.getConfig() });

    const indexer = getIndexer(endpoint);
    const feePayerAddress = getDeployerAddress(privateKey);
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

    txSkeleton = txSkeleton.update('inputs', (inputs: any) =>
        inputs.push({
            cellOutput: {
                capacity: liveCtInfoCell.cell.output.capacity,
                lock: liveCtInfoCell.cell.output.lock,
                type: ctInfoScript,
            },
            data: liveCtInfoCell.cell.data.content,
            outPoint: {
                txHash: ctInfoCellTxHash,
                index: ctInfoCellIndex,
            },
        } as any),
    );

    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs
            .push({
                cellOutput: {
                    capacity: liveCtInfoCell.cell.output.capacity,
                    lock: liveCtInfoCell.cell.output.lock,
                    type: ctInfoScript,
                },
                data: updatedCtInfoData,
            } as any)
            .push({
                cellOutput: {
                    capacity: `0x${CT_TOKEN_OUTPUT_CAPACITY.toString(16)}`,
                    lock: recipientLock,
                    type: ctTokenScript,
                },
                data: `${helper.commitment_hex}${'00'.repeat(32)}`.replace(/^0x0x/, '0x'),
            } as any),
    );

    txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
        cellDeps
            .push({
                outPoint: {
                    txHash: lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
                    index: lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!.INDEX,
                },
                depType: lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!.DEP_TYPE as any,
            })
            .push({
                outPoint: {
                    txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'),
                    index: requiredEnv('CT_INFO_TYPE_INDEX'),
                },
                depType: 'code',
            })
            .push({
                outPoint: {
                    txHash: requiredEnv('CT_TOKEN_TYPE_TX_HASH'),
                    index: requiredEnv('CT_TOKEN_TYPE_INDEX'),
                },
                depType: 'code',
            })
            .push({
                outPoint: {
                    txHash: requiredEnv('STEALTH_LOCK_TX_HASH'),
                    index: requiredEnv('STEALTH_LOCK_INDEX'),
                },
                depType: 'code',
            }),
    );

    txSkeleton = await commons.common.injectCapacity(
        txSkeleton,
        [feePayerAddress],
        CT_TOKEN_OUTPUT_CAPACITY,
        undefined,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = await commons.common.payFeeByFeeRate(
        txSkeleton,
        [feePayerAddress],
        1000,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    const ctInfoWitness = serializeWitnessArgs({
        lock: `0x${'00'.repeat(65)}`,
        inputType: '0x',
        outputType: helper.mint_commitment_hex,
    });
    const ctTokenWitness = serializeWitnessArgs({
        lock: '0x',
        inputType: helper.mint_commitment_hex,
        outputType: helper.range_proof_hex,
    });

    txSkeleton = txSkeleton.update('witnesses', (witnesses: any) =>
        witnesses.clear().push(ctInfoWitness, ctTokenWitness),
    );

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    await waitForTransaction(txHash);

    const outputOutPoint = `${txHash}:0x1`;
    const sessionId = `ct_mint_${txHash.slice(2, 18)}`;
    const commitment = await deriveCommitment(helper.blinding_factor_hex, sessionId);

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
