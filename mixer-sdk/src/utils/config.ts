import type {
    ContractReference,
    MixerRuntimeConfig,
    RegistryReference,
    ScriptHashType,
} from '../types/config';

export interface EnvLike {
    [key: string]: string | undefined;
}

function requireEnv(env: EnvLike, key: string): string {
    const value = env[key];
    if (!value) {
        throw new Error(`Missing required environment value: ${key}`);
    }
    return value;
}

function readOptionalContract(env: EnvLike, prefix: string): ContractReference | undefined {
    const codeHash = env[`${prefix}_CODE_HASH`];
    const hashType = env[`${prefix}_HASH_TYPE`] as ScriptHashType | undefined;

    if (!codeHash || !hashType) {
        return undefined;
    }

    return {
        codeHash,
        hashType,
        txHash: env[`${prefix}_TX_HASH`],
        index: env[`${prefix}_INDEX`],
        depType: (env[`${prefix}_DEP_TYPE`] as 'code' | 'depGroup' | undefined) ?? 'code',
    };
}

function readRequiredContract(env: EnvLike, prefix: string): ContractReference {
    const contract = readOptionalContract(env, prefix);
    if (!contract) {
        throw new Error(`Missing required contract reference for ${prefix}`);
    }
    return contract;
}

function readOptionalRegistry(env: EnvLike): RegistryReference | undefined {
    const txHash = env.NULLIFIER_REGISTRY_TX_HASH;
    const index = env.NULLIFIER_REGISTRY_INDEX;

    if (!txHash || !index) {
        return undefined;
    }

    return {
        txHash,
        index,
        lock: env.NULLIFIER_REGISTRY_LOCK,
        capacity: env.NULLIFIER_REGISTRY_CAPACITY,
        typeArgs: env.NULLIFIER_REGISTRY_TYPE_ARGS,
        nullifiers: env.NULLIFIER_REGISTRY_NULLIFIERS
            ? env.NULLIFIER_REGISTRY_NULLIFIERS.split(',')
                  .map(value => value.trim())
                  .filter(Boolean)
            : undefined,
    };
}

export function loadMixerRuntimeConfig(env: EnvLike): MixerRuntimeConfig {
    return {
        ckbRpcUrl: requireEnv(env, 'CKB_RPC_URL'),
        ckbIndexerUrl: requireEnv(env, 'CKB_INDEXER_URL'),
        mixerPool: readRequiredContract(env, 'MIXER_POOL'),
        nullifierType: readRequiredContract(env, 'NULLIFIER_TYPE'),
        zkMembershipType: readRequiredContract(env, 'ZK_MEMBERSHIP_TYPE'),
        stealthLock: readRequiredContract(env, 'STEALTH_LOCK'),
        ctTokenType: readRequiredContract(env, 'CT_TOKEN_TYPE'),
        ctInfoType: readOptionalContract(env, 'CT_INFO_TYPE'),
        nullifierRegistry: readOptionalRegistry(env),
    };
}
