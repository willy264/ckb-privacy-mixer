import { blake2b, serializeInput, scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { helpers, commons, config as lumosConfig } from '@ckb-lumos/lumos';
import { getDeployerAddress, getDeployerLock, SHANNONS } from './lumos.js';

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

    const hasher = blake2b(32, null, null, null);
    hasher.update(payload);
    const digest = hasher.digest('hex');
    return `0x${digest}00`;
}

export async function buildGenesisCtInfoTransaction(params: {
    privateKey: string;
    ctInfoCodeHash: string;
    ctInfoHashType: 'data' | 'data1' | 'type';
    indexer: any;
    ctInfoDep?: { txHash: string; index: string; depType?: 'code' | 'depGroup' };
    supplyCap?: bigint;
    flags?: number;
}) {
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
    const address = getDeployerAddress(params.privateKey);
    const lock = getDeployerLock(params.privateKey);

    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: params.indexer });
    txSkeleton = await commons.common.injectCapacity(
        txSkeleton,
        [address],
        200n * SHANNONS,
        undefined,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    const firstInput = txSkeleton.get('inputs').get(0);
    if (!firstInput) {
        throw new Error('Unable to find an input for ct-info genesis type-id calculation.');
    }

    const typeArgs = createCtInfoTypeArgs(
        {
            previousOutput: firstInput.outPoint,
            since: '0x0',
        },
        0n,
    );
    const data = createCtInfoData({
        totalSupply: 0n,
        supplyCap: params.supplyCap ?? 0n,
        flags: params.flags ?? MINTABLE,
    });

    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs.update(outputs.size - 1, (cell: any) => ({
            ...cell,
            cellOutput: {
                ...cell.cellOutput,
                lock,
                type: {
                    codeHash: params.ctInfoCodeHash,
                    hashType: params.ctInfoHashType,
                    args: typeArgs,
                },
            },
            data,
        })),
    );

    if (params.ctInfoDep) {
        txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
            cellDeps.push({
                outPoint: {
                    txHash: params.ctInfoDep!.txHash,
                    index: params.ctInfoDep!.index,
                },
                depType: params.ctInfoDep!.depType ?? 'code',
            }),
        );
    }

    txSkeleton = await commons.common.payFeeByFeeRate(
        txSkeleton,
        [address],
        1000,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const output = txSkeleton.get('outputs').get(txSkeleton.get('outputs').size - 1);
    if (!output?.cellOutput?.type) {
        throw new Error('Unable to resolve ct-info genesis output type script.');
    }

    return {
        txSkeleton,
        typeArgs,
        data,
        typeScript: output.cellOutput.type,
        typeScriptHash: scriptToHash(output.cellOutput.type as any),
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
