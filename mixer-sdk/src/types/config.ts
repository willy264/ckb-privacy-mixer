export type ScriptHashType = 'data' | 'data1' | 'type';

export interface ContractReference {
    codeHash: string;
    hashType: ScriptHashType;
    txHash?: string;
    index?: string;
    depType?: 'code' | 'depGroup';
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
}
