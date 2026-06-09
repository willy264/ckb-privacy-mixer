import * as fs from 'fs';
import * as path from 'path';
import { ccc } from '@ckb-ccc/core';
import { getClient, getSigner, requiredEnv, PROJECT_ROOT } from './ccc-common.js';

const TARGET_CODE_HASHES = {
    'MIXER_POOL': '0xbbe4260a673be12640e68d7903495633f610efd99fb463e8c991f56b3e810304',
    'NULLIFIER_TYPE': '0x8998aef3dbf9db0591f9afc8c8a375122014e100e11c0cf600ed658b8b74348f',
    'ZK_MEMBERSHIP_TYPE': '0x3d437152c3ed48b03e261f97da6407a652a74817af3910d6167fedf0c83c5187'
};

async function fetchFromIndexer(method: string, params: any[]) {
    const rpcUrl = process.env.CKB_INDEXER_URL || 'https://testnet.ckbapp.dev/indexer';
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    });
    const data = await response.json() as any;
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.result;
}

async function fetchFromRpc(method: string, params: any[]) {
    const rpcUrl = process.env.CKB_RPC_URL || 'https://testnet.ckbapp.dev/rpc';
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    });
    const data = await response.json() as any;
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.result;
}

async function main() {
    console.log('=== Auto-Discovering Live Contract Cells ===');
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

    console.log('Searching cells for owner lock script...');
    
    let cursor: string | undefined = undefined;
    const foundContracts: Record<string, {txHash: string, index: string, codeHash: string}> = {};
    const targetHashes = Object.values(TARGET_CODE_HASHES);
    const targetNames = Object.keys(TARGET_CODE_HASHES);

    while (true) {
        const result = await fetchFromIndexer('get_cells', [
            {
                script: {
                    code_hash: lockScript.codeHash,
                    hash_type: lockScript.hashType,
                    args: lockScript.args
                },
                script_type: 'lock',
                filter: {
                    output_data_len_range: ['0x1000', '0xffffffff'] // Only look at cells with data > 4KB
                }
            },
            'asc',
            '0x64',
            cursor
        ]);

        for (const cell of result.objects) {
            const txHash = cell.out_point.tx_hash;
            const index = cell.out_point.index;
            
            // Fetch full tx to get the actual data
            const tx = await fetchFromRpc('get_transaction', [txHash]);
            const outputData = tx.transaction.outputs_data[parseInt(index, 16)];
            
            if (outputData && outputData !== '0x') {
                const dataHash = ccc.hexFrom(ccc.hashCkb(ccc.hexFrom(outputData)));
                
                const matchIdx = targetHashes.indexOf(dataHash);
                if (matchIdx >= 0) {
                    const name = targetNames[matchIdx];
                    console.log(`Found ${name} at ${txHash}:${index}`);
                    foundContracts[name] = { txHash, index, codeHash: dataHash };
                }
            }
        }

        if (Object.keys(foundContracts).length === targetNames.length) {
            break; // Found all
        }

        cursor = result.last_cursor;
        if (!cursor || result.objects.length === 0) break;
    }

    if (Object.keys(foundContracts).length === 0) {
        console.log('No contracts found. Are they deployed?');
        return;
    }

    // Update .env file
    const envPath = path.resolve(PROJECT_ROOT, '..', '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    for (const [name, contract] of Object.entries(foundContracts)) {
        envContent = envContent.replace(new RegExp(`${name}_TX_HASH=.*`), `${name}_TX_HASH=${contract.txHash}`);
        envContent = envContent.replace(new RegExp(`${name}_INDEX=.*`), `${name}_INDEX=${contract.index}`);
        envContent = envContent.replace(new RegExp(`${name}_CODE_HASH=.*`), `${name}_CODE_HASH=${contract.codeHash}`);
    }

    fs.writeFileSync(envPath, envContent);
    console.log('\nSuccessfully updated .env file with live outpoints!');
}

main().catch(console.error);
