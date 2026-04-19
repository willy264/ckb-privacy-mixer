import type { DepositNote } from './note';
import type { ContractReference } from './config';
import type { WithdrawalPublicInputs } from './proof';
import type { LocalWithdrawalProofResult } from '../utils/proof';
import type { LiveWithdrawalProvider } from '../providers/withdrawal';

export interface NullifierRegistryCell {
    outPoint: string;
    nullifiers: string[];
    lock?: string;
    capacity?: string;
    typeArgs?: string;
}

export interface WithdrawalContractRefs {
    nullifierType: ContractReference | string;
    zkMembershipType: ContractReference | string;
    ctTokenType: ContractReference | string;
}

export interface WithdrawalInput {
    previousOutput: string;
    role: 'nullifier_registry';
}

export interface WithdrawalOutput {
    kind: 'nullifier_registry' | 'zk_membership' | 'withdrawal';
    lock: string;
    type?: ContractReference | string;
    capacity: string;
    data?: string;
    nullifiers?: string[];
    amount?: string;
}

export interface WithdrawalWitness {
    outputType: string;
}

export interface WithdrawalCellDep {
    contract: ContractReference | string;
}

export interface WithdrawalRawTransaction {
    version: '0x0';
    cellDeps: WithdrawalCellDep[];
    headerDeps: string[];
    inputs: Array<{
        previousOutput: string;
        since: '0x0';
    }>;
    outputs: Array<{
        capacity: string;
        lock: string;
        type?: ContractReference | string;
    }>;
    outputsData: string[];
    witnesses: string[];
}

export interface WithdrawalTransaction {
    rawTransaction: WithdrawalRawTransaction;
    inputs: WithdrawalInput[];
    outputs: WithdrawalOutput[];
    witnesses: WithdrawalWitness[];
    cellDeps: WithdrawalCellDep[];
    publicInputs: WithdrawalPublicInputs;
    publicInputsHex: string;
    serializedWitnessHex: string;
    nullifier: string;
    updatedRegistry: string[];
    isSigned: boolean;
    signature?: string;
}

export interface LiveWithdrawalBuildParams {
    note: DepositNote;
    registryCell: NullifierRegistryCell;
    proof: LocalWithdrawalProofResult;
    privateKey?: string;
    contracts?: Partial<WithdrawalContractRefs>;
    denomination?: bigint;
    recipientLock?: string;
}

export interface LiveWithdrawalExecuteParams {
    provider: LiveWithdrawalProvider;
    privateKey?: string;
    contracts?: Partial<WithdrawalContractRefs>;
    denomination?: bigint;
    recipientLock?: string;
}
