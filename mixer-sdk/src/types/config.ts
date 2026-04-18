export type ScriptHashType = 'data' | 'data1' | 'type';

export interface ContractReference {
    codeHash: string;
    hashType: ScriptHashType;
    txHash?: string;
    index?: string;
    depType?: 'code' | 'depGroup';
}

export interface RegistryReference {
    txHash: string;
    index: string;
    lock?: string;
    capacity?: string;
    nullifiers?: string[];
}

export interface MixerRuntimeConfig {
    ckbRpcUrl: string;
    ckbIndexerUrl: string;
    mixerPool: ContractReference;
    nullifierType: ContractReference;
    zkMembershipType: ContractReference;
    stealthLock: ContractReference;
    ctTokenType: ContractReference;
    ctInfoType?: ContractReference;
    nullifierRegistry?: RegistryReference;
}
