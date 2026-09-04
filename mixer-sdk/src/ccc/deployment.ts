import {
    CellDep,
    Script,
    bytesFrom,
    hashTypeFrom,
    hexFrom,
    type CellDepLike,
    type Client,
    type HashType,
    type HexLike,
    type ScriptLike,
} from '@ckb-ccc/core';
import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import { deriveV1AssetDomain, deriveV1PoolDomain } from '../crypto/script-domain.js';
import { assertHex32, type Hex32 } from '../crypto/field.js';
import { assertV1PoolConfig, type V1PoolConfig } from '../protocol/pool.js';

export type V1ContractRole =
    | 'poolState'
    | 'vault'
    | 'stagingDeposit'
    | 'nullifier'
    | 'ctToken'
    | 'verifier';

export interface V1ContractDeployment {
    readonly script: ScriptLike;
    readonly cellDep: CellDepLike;
}

export interface DeployedV1Pool extends V1PoolConfig {
    readonly poolType: ScriptLike;
    readonly assetType: ScriptLike;
}

export interface PrivacyDeployment {
    readonly protocolVersion: 'obscell-v1';
    readonly network: string;
    readonly genesisHash: Hex32;
    readonly addressPrefix: string;
    readonly contracts: Readonly<Record<V1ContractRole, V1ContractDeployment>>;
    readonly pools: readonly DeployedV1Pool[];
}

export interface V1ScriptCodeReference {
    readonly codeHash: string;
    readonly hashType: HashType;
}

export interface DecodedPoolTypeArgsV1 {
    readonly version: 1;
    readonly typeId: string;
    readonly vaultLock: V1ScriptCodeReference;
    readonly stagingLock: V1ScriptCodeReference;
}

export const V1_POOL_TYPE_ARGS_BYTES = 100 as const;

function decodeScriptCodeReference(bytes: Uint8Array, name: string): V1ScriptCodeReference {
    const codeHash = assertHex32(hexFrom(bytes.subarray(0, 32)), `${name}.codeHash`);
    if (BigInt(codeHash) === 0n) {
        throw new InvalidArgumentError(`${name}.codeHash must not be zero.`);
    }
    let hashType: HashType;
    try {
        hashType = hashTypeFrom(bytes[32]);
    } catch {
        throw new InvalidArgumentError(`${name}.hashType is invalid.`);
    }
    return Object.freeze({ codeHash, hashType });
}

export function decodePoolTypeArgsV1(args: HexLike): DecodedPoolTypeArgsV1 {
    const bytes = bytesFrom(args);
    if (bytes.length !== V1_POOL_TYPE_ARGS_BYTES) {
        throw new InvalidArgumentError(
            `PoolTypeArgsV1 must contain exactly ${V1_POOL_TYPE_ARGS_BYTES} bytes.`,
            { length: bytes.length },
        );
    }
    const version = bytes[0] | (bytes[1] << 8);
    if (version !== 1) {
        throw new InvalidArgumentError(`Unsupported PoolTypeArgsV1 version: ${version}`);
    }
    const typeId = assertHex32(hexFrom(bytes.subarray(2, 34)), 'poolTypeArgs.typeId');
    if (BigInt(typeId) === 0n) {
        throw new InvalidArgumentError('poolTypeArgs.typeId must not be zero.');
    }
    const vaultLock = decodeScriptCodeReference(bytes.subarray(34, 67), 'poolTypeArgs.vaultLock');
    const stagingLock = decodeScriptCodeReference(bytes.subarray(67, 100), 'poolTypeArgs.stagingLock');
    if (vaultLock.codeHash === stagingLock.codeHash && vaultLock.hashType === stagingLock.hashType) {
        throw new InvalidArgumentError('PoolTypeArgsV1 vault and staging lock code references must differ.');
    }
    return Object.freeze({ version: 1, typeId, vaultLock, stagingLock });
}

function scriptCodeMatches(script: Script, reference: V1ScriptCodeReference): boolean {
    return script.codeHash === reference.codeHash && script.hashType === reference.hashType;
}

const CONTRACT_ROLES: readonly V1ContractRole[] = [
    'poolState',
    'vault',
    'stagingDeposit',
    'nullifier',
    'ctToken',
    'verifier',
];

export function assertPrivacyDeployment(deployment: PrivacyDeployment): PrivacyDeployment {
    if (deployment.protocolVersion !== 'obscell-v1') {
        throw new InvalidArgumentError('Privacy deployment must explicitly target obscell-v1.');
    }
    if (!deployment.network || !deployment.addressPrefix) {
        throw new InvalidArgumentError('Privacy deployment requires a network and address prefix.');
    }
    const genesisHash = assertHex32(deployment.genesisHash, 'deployment.genesisHash');
    if (BigInt(genesisHash) === 0n) {
        throw new InvalidArgumentError('Privacy deployment genesis hash must not be zero.');
    }
    for (const role of CONTRACT_ROLES) {
        const contract = deployment.contracts?.[role];
        if (!contract) {
            throw new InvalidArgumentError(`Privacy deployment is missing the ${role} contract.`);
        }
        Script.from(contract.script);
        CellDep.from(contract.cellDep);
    }
    if (!deployment.pools.length) {
        throw new InvalidArgumentError('Privacy deployment must contain at least one pool.');
    }

    const ids = new Set<string>();
    for (const pool of deployment.pools) {
        assertV1PoolConfig(pool);
        const poolType = Script.from(pool.poolType);
        const assetType = Script.from(pool.assetType);
        const poolTypeArgs = decodePoolTypeArgsV1(poolType.args);
        if (poolTypeArgs.typeId !== pool.id) {
            throw new InvariantViolationError('Pool id must equal PoolTypeArgsV1.type_id.');
        }
        if (!scriptCodeMatches(poolType, Script.from(deployment.contracts.poolState.script))) {
            throw new InvariantViolationError('Pool type script code does not match the deployed PoolState contract.');
        }
        if (!scriptCodeMatches(Script.from(deployment.contracts.vault.script), poolTypeArgs.vaultLock)) {
            throw new InvariantViolationError('PoolTypeArgsV1 vault lock reference does not match deployment.');
        }
        if (!scriptCodeMatches(Script.from(deployment.contracts.stagingDeposit.script), poolTypeArgs.stagingLock)) {
            throw new InvariantViolationError('PoolTypeArgsV1 staging lock reference does not match deployment.');
        }
        if (assetType.hash() !== pool.assetId) {
            throw new InvariantViolationError('Asset id must equal the canonical CT type script hash.');
        }
        if (!scriptCodeMatches(assetType, Script.from(deployment.contracts.ctToken.script))) {
            throw new InvariantViolationError('Pool asset script code does not match the deployed CT contract.');
        }
        if (ids.has(pool.id)) {
            throw new InvalidArgumentError(`Duplicate pool id in deployment: ${pool.id}`);
        }
        ids.add(pool.id);
    }
    return deployment;
}

export function assertDeploymentClient(
    deployment: PrivacyDeployment,
    client: Client,
): void {
    if (!client || typeof client.getCellLive !== 'function' ||
        typeof client.getBlockByNumber !== 'function' || typeof client.sendTransaction !== 'function') {
        throw new InvalidArgumentError('createPrivacyClient requires an injected CCC Client.');
    }
    if (client.addressPrefix !== deployment.addressPrefix) {
        throw new InvariantViolationError(
            `CCC Client address prefix ${client.addressPrefix} does not match deployment prefix ${deployment.addressPrefix}.`,
        );
    }
}

export async function assertDeploymentNetwork(
    deployment: PrivacyDeployment,
    client: Client,
): Promise<void> {
    assertPrivacyDeployment(deployment);
    assertDeploymentClient(deployment, client);
    const genesis = await client.getBlockByNumber(0n);
    if (!genesis) {
        throw new InvariantViolationError('Injected CCC Client did not return the network genesis header.');
    }
    const actual = assertHex32(genesis.header.hash, 'client genesis hash');
    if (actual !== deployment.genesisHash) {
        throw new InvariantViolationError(
            `CCC Client genesis hash ${actual} does not match deployment ${deployment.genesisHash}.`,
        );
    }
}

export async function assertDeploymentDomains(deployment: PrivacyDeployment): Promise<void> {
    assertPrivacyDeployment(deployment);
    for (const pool of deployment.pools) {
        const [poolDomain, assetDomain] = await Promise.all([
            deriveV1PoolDomain(pool.poolType),
            deriveV1AssetDomain(pool.assetType),
        ]);
        if (poolDomain !== pool.poolDomain) {
            throw new InvariantViolationError(`Pool domain mismatch for ${pool.id}.`);
        }
        if (assetDomain !== pool.assetDomain) {
            throw new InvariantViolationError(`Asset domain mismatch for ${pool.id}.`);
        }
    }
}
