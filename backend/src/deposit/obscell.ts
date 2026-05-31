import { blake2b, PERSONAL, serializeInput } from '@nervosnetwork/ckb-sdk-utils';
import { ccc } from '@ckb-ccc/core';
import { SHANNONS } from './ccc.js';

export const CT_INFO_DATA_SIZE = 57;
export const MINTABLE = 0x01;

export interface CtInfoData {
    totalSupply: bigint;
    supplyCap: bigint;
    flags: number;
    reserved?: Uint8Array;
}

export function createCtInfoData(data: CtInfoData): string {
    const reserved = data.reserved ?? new Uint8Array(24);
    if (reserved.length !== 24) {
        throw new Error(`ct-info reserved field must be 24 bytes, got ${reserved.length}`);
    }

    const out = new Uint8Array(CT_INFO_DATA_SIZE);
    writeU128Le(out, 0, data.totalSupply);
    writeU128Le(out, 16, data.supplyCap);
    out.set(reserved, 32);
    out[56] = data.flags;
    return `0x${Buffer.from(out).toString('hex')}`;
}

export function parseCtInfoData(dataHex: string): CtInfoData {
    const bytes = Buffer.from(dataHex.replace(/^0x/, ''), 'hex');
    if (bytes.length !== CT_INFO_DATA_SIZE) {
        throw new Error(`ct-info data must be ${CT_INFO_DATA_SIZE} bytes, got ${bytes.length}`);
    }

    return {
        totalSupply: readU128Le(bytes, 0),
        supplyCap: readU128Le(bytes, 16),
        reserved: new Uint8Array(bytes.slice(32, 56)),
        flags: bytes[56],
    };
}

export function createCtInfoTypeArgs(firstInput: any, outputIndex: bigint | number): string {
    const serializedInput = serializeInput(firstInput);
    const inputBytes = Buffer.from(serializedInput.replace(/^0x/, ''), 'hex');
    const indexBytes = Buffer.alloc(8);
    indexBytes.writeBigUInt64LE(BigInt(outputIndex));
    const payload = Buffer.concat([inputBytes, indexBytes]);

    const hasher = blake2b(32, null, null, PERSONAL);
    hasher.update(payload);
    const digest = hasher.digest('hex');
    const args = `0x${digest}`;

    const argsBytes = Buffer.from(args.slice(2), 'hex');
    if (argsBytes.byteLength !== 32) {
        throw new Error(`ct-info type args must be exactly 32 bytes, got ${argsBytes.byteLength}`);
    }

    return args;
}

export async function buildGenesisCtInfoTransaction(params: {
    privateKey: string;
    ctInfoCodeHash: string;
    ctInfoHashType: 'data' | 'data1' | 'type';
    client: ccc.Client;
    ctInfoDep?: { txHash: string; index: string; depType?: 'code' | 'depGroup' };
    supplyCap?: bigint;
    flags?: number;
}) {
    const signer = new ccc.SignerCkbPrivateKey(
        params.client,
        params.privateKey.startsWith('0x') ? params.privateKey : `0x${params.privateKey}`
    );
    const addressObj = await ccc.Address.fromString(await signer.getRecommendedAddress(), params.client);
    const lock = addressObj.script;

    const cccTx = ccc.Transaction.from({});
    // Add a dummy input to calculate TypeID/CtInfo args. We will replace it during completeInputsByCapacity,
    // but actually completeInputsByCapacity adds to existing inputs if needed.
    // Wait, completeInputsByCapacity will just fetch live cells and add them.
    // Let's call completeInputsByCapacity first to get inputs!
    const dummySigner = new ccc.SignerCkbScriptReadonly(params.client, lock);
    
    // We want to create an output with capacity ~200 CKB
    cccTx.addOutput({
        capacity: ccc.numFrom(200n * SHANNONS),
        lock,
        type: ccc.Script.from({
            codeHash: params.ctInfoCodeHash,
            hashType: params.ctInfoHashType,
            args: '0x' + '00'.repeat(32), // dummy args for size estimation
        }),
    }, '0x' + '00'.repeat(CT_INFO_DATA_SIZE));

    await cccTx.completeInputsByCapacity(dummySigner);
    if (cccTx.inputs.length === 0) {
        throw new Error('Unable to find an input for ct-info genesis type-id calculation.');
    }

    const firstInput = cccTx.inputs[0];

    const typeArgs = createCtInfoTypeArgs(
        {
            previousOutput: firstInput.previousOutput,
            since: '0x0',
        },
        0n, // output index is 0
    );
    const data = createCtInfoData({
        totalSupply: 0n,
        supplyCap: params.supplyCap ?? 0n,
        flags: params.flags ?? MINTABLE,
    });

    const typeArgsBytes = Buffer.from(typeArgs.slice(2), 'hex');
    if (typeArgsBytes.byteLength !== 32) {
        throw new Error(`ct-info genesis args must be 32 bytes, got ${typeArgsBytes.byteLength}`);
    }

    const dataBytes = Buffer.from(data.slice(2), 'hex');
    if (dataBytes.byteLength !== CT_INFO_DATA_SIZE) {
        throw new Error(`ct-info genesis data must be ${CT_INFO_DATA_SIZE} bytes, got ${dataBytes.byteLength}`);
    }

    // Update the output with the real args and data
    cccTx.outputs[0].type!.args = typeArgs as `0x${string}`;
    cccTx.outputsData[0] = ccc.hexFrom(data);

    if (params.ctInfoDep) {
        cccTx.addCellDeps({
            outPoint: {
                txHash: params.ctInfoDep.txHash,
                index: ccc.numToHex(params.ctInfoDep.index),
            },
            depType: params.ctInfoDep.depType ?? 'code',
        });
    }

    const secp = await params.client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    cccTx.addCellDeps({
        outPoint: secp.cellDeps[0].cellDep.outPoint,
        depType: secp.cellDeps[0].cellDep.depType,
    });

    await cccTx.completeFeeBy(dummySigner, 1000);

    const typeScript = cccTx.outputs[0].type!;

    return {
        cccTx,
        typeArgs,
        data,
        typeScript,
        typeScriptHash: typeScript.hash(),
    };
}

function writeU128Le(target: Uint8Array, offset: number, value: bigint) {
    let remaining = value;
    for (let i = 0; i < 16; i += 1) {
        target[offset + i] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }
}

function readU128Le(source: Uint8Array | Buffer, offset: number): bigint {
    let value = 0n;
    for (let i = 15; i >= 0; i -= 1) {
        value <<= 8n;
        value |= BigInt(source[offset + i]);
    }
    return value;
}
