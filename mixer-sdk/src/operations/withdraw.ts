import type { DepositNote } from '../types/note';
import type {
    LiveWithdrawalBuildParams,
    LiveWithdrawalExecuteParams,
    NullifierRegistryCell,
    WithdrawalContractRefs,
    WithdrawalTransaction,
} from '../types/withdrawal';
import { deriveNullifier } from '../utils/crypto';
import { normalizeHex } from '../utils/encoding';
import { serializeWithdrawalPublicInputsHex } from '../utils/proof';

const SPENT_NULLIFIERS = new Set<string>();
const DEFAULT_DENOMINATION = 100n;

const DEFAULT_CONTRACTS: WithdrawalContractRefs = {
    nullifierType: 'nullifier-type',
    zkMembershipType: 'zk-membership-type',
    ctTokenType: 'ct-token-type',
};

function isProviderExecutionParams(
    params: Omit<LiveWithdrawalBuildParams, 'note'> | LiveWithdrawalExecuteParams,
): params is LiveWithdrawalExecuteParams {
    return 'provider' in params;
}

function normalizeRegistry(nullifiers: string[]): string[] {
    return nullifiers.map(normalizeHex);
}

function validateNote(note: DepositNote) {
    if (!note.sessionId) {
        throw new Error('Missing sessionId in deposit note');
    }
    if (!note.inputOutPoint) {
        throw new Error('Missing inputOutPoint in deposit note');
    }
    if (!note.stealthOutputAddress) {
        throw new Error('Missing stealthOutputAddress in deposit note');
    }

    const blindingFactor = normalizeHex(note.blindingFactor);
    if (!/^[0-9a-fA-F]{64}$/.test(blindingFactor)) {
        throw new Error('Deposit note blindingFactor must be a 32-byte hex string');
    }
}

function validateRegistryCell(registryCell: NullifierRegistryCell) {
    if (!registryCell.outPoint) {
        throw new Error('Missing outPoint for nullifier registry cell');
    }
}

function resolveRecipientLock(note: DepositNote, recipientLock?: string): string {
    return recipientLock ?? note.stealthOutputAddress;
}

function serializeRegistryDataHex(nullifiers: string[]): string {
    const countHex = nullifiers.length.toString(16).padStart(8, '0');
    return `0x${countHex}${nullifiers.join('')}`;
}

export function getSpentNullifiers(): string[] {
    return [...SPENT_NULLIFIERS];
}

export function clearSpentNullifiers() {
    SPENT_NULLIFIERS.clear();
}

export function buildWithdrawTransaction(params: LiveWithdrawalBuildParams): WithdrawalTransaction {
    const {
        note,
        registryCell,
        proof,
        privateKey,
        contracts = {},
        denomination = DEFAULT_DENOMINATION,
        recipientLock,
    } = params;

    validateNote(note);
    validateRegistryCell(registryCell);

    if (!proof.proofValid) {
        throw new Error('Cannot build withdrawal transaction with an invalid membership proof');
    }

    const mergedContracts: WithdrawalContractRefs = {
        ...DEFAULT_CONTRACTS,
        ...contracts,
    };

    const derivedNullifier = deriveNullifier(note.blindingFactor, note.sessionId);
    if (proof.publicInputs.nullifier !== derivedNullifier) {
        throw new Error('Proof public inputs nullifier does not match the deposit note');
    }
    if (proof.publicInputs.merkleRoot !== proof.witnessBundle.proof.root) {
        throw new Error('Proof public inputs root does not match the Merkle proof root');
    }
    if (note.nullifier && note.nullifier !== derivedNullifier) {
        throw new Error('Deposit note nullifier does not match the derived nullifier');
    }

    const normalizedNullifier = normalizeHex(derivedNullifier);
    const currentRegistry = normalizeRegistry(registryCell.nullifiers);
    if (currentRegistry.includes(normalizedNullifier)) {
        throw new Error(`Nullifier already present in registry: ${normalizedNullifier}`);
    }

    const updatedRegistry = [...currentRegistry, normalizedNullifier];
    const verifierOutputDataHex = `0x${serializeWithdrawalPublicInputsHex(proof.publicInputs)}`;
    const proofWitnessHex = `0x${Array.from(proof.serializedWitness, byte => byte.toString(16).padStart(2, '0')).join('')}`;

    return {
        rawTransaction: {
            version: '0x0',
            cellDeps: [
                { contract: mergedContracts.nullifierType },
                { contract: mergedContracts.zkMembershipType },
                { contract: mergedContracts.ctTokenType },
            ],
            headerDeps: [],
            inputs: [
                {
                    previousOutput: registryCell.outPoint,
                    since: '0x0',
                },
            ],
            outputs: [
                {
                    capacity: registryCell.capacity ?? '1000',
                    lock: registryCell.lock ?? 'always_success',
                    type: mergedContracts.nullifierType,
                },
                {
                    capacity: '1000',
                    lock: 'always_success',
                    type: mergedContracts.zkMembershipType,
                },
                {
                    capacity: '1000',
                    lock: resolveRecipientLock(note, recipientLock),
                    type: mergedContracts.ctTokenType,
                },
            ],
            outputsData: [
                serializeRegistryDataHex(updatedRegistry),
                verifierOutputDataHex,
                '0x',
            ],
            witnesses: [proofWitnessHex],
        },
        inputs: [
            {
                previousOutput: registryCell.outPoint,
                role: 'nullifier_registry',
            },
        ],
        outputs: [
            {
                kind: 'nullifier_registry',
                lock: registryCell.lock ?? 'always_success',
                type: mergedContracts.nullifierType,
                capacity: registryCell.capacity ?? '1000',
                nullifiers: updatedRegistry,
            },
            {
                kind: 'zk_membership',
                lock: 'always_success',
                type: mergedContracts.zkMembershipType,
                capacity: '1000',
                data: verifierOutputDataHex,
            },
            {
                kind: 'withdrawal',
                lock: resolveRecipientLock(note, recipientLock),
                type: mergedContracts.ctTokenType,
                capacity: '1000',
                amount: denomination.toString(),
            },
        ],
        witnesses: [
            {
                outputType: proofWitnessHex,
            },
        ],
        cellDeps: [
            { contract: mergedContracts.nullifierType },
            { contract: mergedContracts.zkMembershipType },
            { contract: mergedContracts.ctTokenType },
        ],
        publicInputs: proof.publicInputs,
        publicInputsHex: verifierOutputDataHex,
        serializedWitnessHex: proofWitnessHex,
        nullifier: normalizedNullifier,
        updatedRegistry,
        isSigned: !!privateKey,
        signature: privateKey ? `0x_withdraw_sig_${privateKey.slice(0, 8)}` : undefined,
    };
}

export async function prepareLiveWithdrawTransaction(
    note: DepositNote,
    params: Omit<LiveWithdrawalBuildParams, 'note'> | LiveWithdrawalExecuteParams,
): Promise<WithdrawalTransaction> {
    validateNote(note);

    if (isProviderExecutionParams(params)) {
        const resolution = await params.provider.resolveWithdrawal(note);
        return buildWithdrawTransaction({
            note,
            registryCell: resolution.registryCell,
            proof: resolution.proof,
            privateKey: params.privateKey,
            contracts: {
                ...params.contracts,
                ...(resolution.config.nullifierType
                    ? { nullifierType: resolution.config.nullifierType }
                    : {}),
                ...(resolution.config.zkMembershipType
                    ? { zkMembershipType: resolution.config.zkMembershipType }
                    : {}),
                ...(resolution.config.ctTokenType
                    ? { ctTokenType: resolution.config.ctTokenType }
                    : {}),
            },
            denomination: params.denomination,
            recipientLock: params.recipientLock,
        });
    }

    return buildWithdrawTransaction({
        note,
        ...params,
    });
}

export async function withdrawMix(
    note: DepositNote,
    params?: Omit<LiveWithdrawalBuildParams, 'note'> | LiveWithdrawalExecuteParams,
): Promise<string> {
    validateNote(note);

    const nullifier = normalizeHex(deriveNullifier(note.blindingFactor, note.sessionId));
    if (SPENT_NULLIFIERS.has(nullifier)) {
        throw new Error(`Nullifier already used: ${nullifier}`);
    }

    if (!params) {
        SPENT_NULLIFIERS.add(nullifier);
        return `0xwithdraw_${nullifier.slice(0, 56)}`;
    }

    const providerExecution = isProviderExecutionParams(params);
    const providerTx = await prepareLiveWithdrawTransaction(note, params);

    SPENT_NULLIFIERS.add(providerTx.nullifier);

    if (providerExecution && params.provider.submitWithdrawal) {
        return params.provider.submitWithdrawal(providerTx);
    }

    return `0xwithdraw_${providerTx.nullifier.slice(0, 56)}`;
}
