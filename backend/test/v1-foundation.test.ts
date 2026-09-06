import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from '@ckb-ccc/core';
import type { Hex, PoolChainSnapshotV1, StagingDepositV1, WithdrawalIntentV1 } from '../src/v1/types.js';
import { V1Coordinator } from '../src/v1/coordinator.js';
import { V1Relayer, type V1OperationStore } from '../src/v1/relayer.js';
import {
    parsePoolChainSnapshotV1,
    parseStagingDepositV1,
    parseWithdrawalIntentV1,
    validateIntentAgainstChain,
    validateReconstructedPlan,
} from '../src/v1/validation.js';

const h = (byte: string) => `0x${byte.repeat(64)}` as Hex;
const hashNumber = (value: number) => `0x${value.toString(16).padStart(64, '0')}` as Hex;
const q = (value: number) => `0x${value.toString(16)}` as Hex;
const field = (value: number) => `0x${value.toString(16).padStart(2, '0')}${'00'.repeat(31)}` as Hex;
const le32 = (value: bigint) => {
    const bytes = value.toString(16).padStart(64, '0').match(/../g) ?? [];
    return bytes.reverse().join('');
};
const script = { codeHash: h('a'), hashType: 'type' as const, args: '0x' as Hex };
const state: PoolChainSnapshotV1 = {
    version: 1, poolId: h('1'), assetId: Script.from(script).hash() as Hex,
    poolDomain: field(2), assetDomain: field(3), denomination: field(100),
    treeDepth: 20, rootHistorySize: 4, sequence: q(7), root: field(5),
    nullifierRoot: field(4), nextLeafIndex: q(2), outstandingCount: q(2),
    outstandingValue: q(200), frontier: Array.from({ length: 20 }, (_, index) => field(20 + index)),
    acceptedRoots: [field(5)], poolState: { txHash: h('6'), index: q(0) },
    vault: { txHash: h('7'), index: q(1) }, vaultValue: q(200), ctType: script,
    blockNumber: q(100), blockHash: h('b'),
};
const makeStaging = (overrides: Partial<StagingDepositV1> = {}): StagingDepositV1 => ({
    version: 1,
    outPoint: { txHash: h('d'), index: q(0) },
    blockNumber: q(101),
    blockHash: h('e'),
    poolId: state.poolId,
    assetId: state.assetId,
    assetDomain: state.assetDomain,
    denomination: state.denomination,
    commitment: field(16),
    refundLockHash: h('f'),
    refundSince: q(0x8000_0000_0000_000an),
    capacityReserve: q(100),
    ...overrides,
});
const intent: WithdrawalIntentV1 = {
    version: 1, poolId: state.poolId,
    expectedState: { sequence: state.sequence, poolState: state.poolState, vault: state.vault, root: state.root, vaultValue: state.vaultValue },
    recipient: { lock: { ...script, args: '0x11' }, ctType: script, capacity: q(100), data: '0x22' },
    publicSignals: {
        poolDomain: state.poolDomain, assetDomain: state.assetDomain, denomination: state.denomination,
        value: state.denomination, root: state.root, nullifierHash: field(8), recipientDomain: field(9),
        actionHash: field(11), authTag: field(12),
    },
    proof: { system: 'groth16-bn254', bytes: `0x${'01'.repeat(256)}` }, maxFeeShannons: q(1000),
};

test('typed intent parser rejects unknown and non-canonical fields', () => {
    assert.deepEqual(parseWithdrawalIntentV1(intent), intent);
    assert.throws(() => parseWithdrawalIntentV1({ ...intent, poolId: h('A') }), /canonical lowercase/);
    assert.throws(() => parseWithdrawalIntentV1({ ...intent, poolId: h('0') }), /non-zero/);
    assert.throws(() => parseWithdrawalIntentV1({ ...intent, extra: true }), /unrecognized/i);
    assert.throws(() => parseWithdrawalIntentV1({ ...intent, maxFeeShannons: '0x00' }), /canonical/);
    assert.throws(() => parseWithdrawalIntentV1({ ...intent, maxFeeShannons: `0x1${'0'.repeat(16)}` }), /64-bit/);
    assert.throws(() => parseWithdrawalIntentV1({
        ...intent,
        publicSignals: { ...intent.publicSignals, root: `0x${'ff'.repeat(32)}` },
    }), /not canonical BN254 Fr/);
    assert.doesNotThrow(() => parseWithdrawalIntentV1({
        ...intent,
        recipient: { ...intent.recipient, ctType: { ...intent.recipient.ctType, hashType: 'data2' } },
    }));
    const fqModulus = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
    assert.throws(() => parseWithdrawalIntentV1({
        ...intent,
        proof: { ...intent.proof, bytes: `0x${le32(fqModulus)}${'01'.repeat(224)}` },
    }), /not canonical BN254 Fq/);
    assert.throws(() => parseWithdrawalIntentV1({
        ...intent,
        proof: { ...intent.proof, bytes: `0x${'00'.repeat(64)}${'01'.repeat(192)}` },
    }), /infinity point/);
});

test('backend parser consumes the exact SDK relayer wire fixture', () => {
    const fixture = JSON.parse(readFileSync(
        new URL('../../mixer-sdk/test-vectors/withdrawal-intent-wire.json', import.meta.url),
        'utf8',
    ));
    const parsed = parseWithdrawalIntentV1(fixture);
    assert.deepEqual(parsed, fixture);
    assert.equal(parsed.proof.bytes.length, 514);
    assert.equal(parsed.recipient.capacity, '0x34e62ce00');
});

test('chain snapshots require root history to end at the current root', () => {
    assert.deepEqual(parsePoolChainSnapshotV1(state), state);
    assert.throws(() => parsePoolChainSnapshotV1({
        ...state,
        acceptedRoots: [state.root, field(6)],
    }), /must end with the current/);
    assert.throws(() => parsePoolChainSnapshotV1({ ...state, poolId: h('0') }), /non-zero/);
    assert.throws(() => parsePoolChainSnapshotV1({ ...state, assetId: h('0') }), /non-zero/);
});

test('staging parser enforces covenant refund encodings', () => {
    const deposit = makeStaging();
    assert.deepEqual(parseStagingDepositV1(deposit), deposit);
    assert.throws(() => parseStagingDepositV1({ ...deposit, refundSince: q(10) }), /relative block-number/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, refundSince: q(0x4000_0000_0000_000an) }), /relative block-number/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, refundSince: q(0x8000_0000_0000_0000n) }), /relative block-number/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, refundLockHash: h('0') }), /non-zero/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, capacityReserve: q(0) }), /positive/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, poolId: h('0') }), /non-zero/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, assetId: h('0') }), /non-zero/);
    assert.throws(() => parseStagingDepositV1({ ...deposit, commitment: field(0) }), /non-zero/);
});

test('intent validation rejects stale state and protected-field mutation', () => {
    const protectedFields = { recipientDomain: field(9), actionHash: field(11) };
    assert.doesNotThrow(() => validateIntentAgainstChain(intent, state, protectedFields));
    assert.throws(() => validateIntentAgainstChain(intent, { ...state, sequence: q(8) }, protectedFields), /sequence/);
    assert.throws(() => validateIntentAgainstChain(intent, state, { ...protectedFields, actionHash: field(13) }), /action hash/);
    assert.throws(() => validateIntentAgainstChain({ ...intent, recipient: { ...intent.recipient, ctType: { ...script, args: '0xff' } } }, state, protectedFields), /CT type/);
});

test('intent validation accepts retained roots but rejects mismatched or evicted roots', () => {
    const protectedFields = { recipientDomain: field(9), actionHash: field(11) };
    const retainedRoot = field(14);
    const historicalIntent = {
        ...intent,
        expectedState: { ...intent.expectedState, root: retainedRoot },
        publicSignals: { ...intent.publicSignals, root: retainedRoot },
    };
    assert.doesNotThrow(() => validateIntentAgainstChain(
        historicalIntent,
        { ...state, acceptedRoots: [retainedRoot, state.root] },
        protectedFields,
    ));
    assert.throws(() => validateIntentAgainstChain(
        { ...historicalIntent, expectedState: { ...historicalIntent.expectedState, root: field(15) } },
        { ...state, acceptedRoots: [retainedRoot, state.root] },
        protectedFields,
    ), /expected proof root/);
    assert.throws(() => validateIntentAgainstChain(
        historicalIntent,
        { ...state, acceptedRoots: [state.root] },
        protectedFields,
    ), /accepted-root window/);
});

test('reconstructed plans may add only untyped fee inputs within the ceiling', () => {
    const base = {
        feeShannons: 999n,
        protectedFields: { recipientDomain: field(9), actionHash: field(11) },
        privacyInputOutPoints: [state.poolState, state.vault],
        feeInputs: [{ outPoint: { txHash: h('d'), index: q(0) } }],
        recipient: intent.recipient,
        transaction: {},
    };
    assert.doesNotThrow(() => validateReconstructedPlan(intent, base));
    assert.throws(() => validateReconstructedPlan(intent, { ...base, feeShannons: 1001n }), /fee ceiling/);
    assert.throws(() => validateReconstructedPlan(intent, { ...base, feeInputs: [{ ...base.feeInputs[0], type: script }] }), /untyped/);
    assert.throws(() => validateReconstructedPlan(intent, { ...base, recipient: { ...intent.recipient, data: '0xff' } }), /recipient/);
    assert.throws(() => validateReconstructedPlan(intent, { ...base, feeInputs: [base.feeInputs[0], base.feeInputs[0]] }), /duplicate/);
});

test('coordinator derives deterministic ordering from confirmed chain staging cells', async () => {
    const staging = [
        makeStaging({ outPoint: { txHash: h('f'), index: q(2) }, blockNumber: q(102), blockHash: h('e'), commitment: field(17) }),
        makeStaging({ outPoint: { txHash: h('d'), index: q(1) }, blockNumber: q(101), blockHash: h('c'), commitment: field(18) }),
    ];
    const coordinator = new V1Coordinator(
        { getPoolSnapshot: async () => state, listConfirmedStaging: async () => staging },
        { buildAcceptance: async (_state, ordered) => ordered.map(item => item.outPoint.txHash) },
    );
    const plan = await coordinator.planAcceptance(state.poolId);
    assert.deepEqual(plan?.staging.map(item => item.outPoint.txHash), [h('d'), h('f')]);
});

test('relayer reconstructs from chain state and records every committed lifecycle state', async () => {
    const statuses: string[] = [];
    let locked = false;
    const operationStore: V1OperationStore = {
        acquireNullifier: async () => { if (locked) return false; locked = true; return true; },
        releaseNullifier: async () => { locked = false; },
        put: async operation => { statuses.push(operation.status); },
        get: async () => undefined,
    };
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async txHash => assert.equal(txHash, h('e')) },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => ({
                feeShannons: 10n,
                protectedFields: { recipientDomain: field(9), actionHash: field(11) },
                privacyInputOutPoints: [state.poolState, state.vault],
                feeInputs: [], recipient: intent.recipient, transaction: { rebuilt: true },
            }),
        },
        transactionInspector: { validate: async (_intent, _state, plan) => assert.deepEqual(plan.transaction, { rebuilt: true }) },
        submitter: {
            transactionHash: async transaction => { assert.deepEqual(transaction, { rebuilt: true }); return h('e'); },
            submit: async transaction => { assert.deepEqual(transaction, { rebuilt: true }); return h('e'); },
        },
        operations: operationStore,
    });
    const result = await relayer.submit(intent);
    assert.equal(result.status, 'committed');
    assert.deepEqual(statuses, ['queued', 'validated', 'submitted', 'committed']);
    await assert.rejects(() => relayer.submit(intent), /already queued/);
});

test('relayer releases the operational nullifier lock after pre-submission validation failure', async () => {
    let locked = false;
    let releases = 0;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => ({ ...state, sequence: q(8) }), waitForCommitted: async () => undefined },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => assert.fail('reconstruction must not run for stale state'),
        },
        transactionInspector: { validate: async () => assert.fail('inspection must not run for stale state') },
        submitter: {
            transactionHash: async () => assert.fail('hashing must not run for stale state'),
            submit: async () => assert.fail('submission must not run for stale state'),
        },
        operations: {
            acquireNullifier: async () => { if (locked) return false; locked = true; return true; },
            releaseNullifier: async () => { locked = false; releases += 1; },
            put: async () => undefined,
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /sequence/);
    await assert.rejects(() => relayer.submit(intent), /sequence/);
    assert.equal(releases, 2);
});

test('relayer releases pre-broadcast locks when operation persistence fails', async () => {
    let releases = 0;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async () => undefined },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => assert.fail('reconstruction must not run without a queue record'),
        },
        transactionInspector: { validate: async () => assert.fail('inspection must not run without a queue record') },
        submitter: {
            transactionHash: async () => assert.fail('hashing must not run without a queue record'),
            submit: async () => assert.fail('submission must not run without a queue record'),
        },
        operations: {
            acquireNullifier: async () => true,
            releaseNullifier: async () => { releases += 1; },
            put: async () => { throw new Error('queue persistence failed'); },
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /queue persistence failed/);
    assert.equal(releases, 1);
});

test('relayer preserves validation errors and releases when failed-state persistence also fails', async () => {
    let puts = 0;
    let releases = 0;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => ({ ...state, sequence: q(8) }), waitForCommitted: async () => undefined },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => assert.fail('reconstruction must not run for stale state'),
        },
        transactionInspector: { validate: async () => assert.fail('inspection must not run for stale state') },
        submitter: {
            transactionHash: async () => assert.fail('hashing must not run for stale state'),
            submit: async () => assert.fail('submission must not run for stale state'),
        },
        operations: {
            acquireNullifier: async () => true,
            releaseNullifier: async () => { releases += 1; },
            put: async () => {
                puts += 1;
                if (puts === 2) throw new Error('failed-state persistence failed');
            },
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /sequence/);
    assert.equal(puts, 2);
    assert.equal(releases, 1);
});

test('coordinator quarantines staging metadata that disagrees with authoritative pool state', async () => {
    const coordinator = new V1Coordinator(
        {
            getPoolSnapshot: async () => state,
            listConfirmedStaging: async () => [makeStaging({ assetDomain: field(15) })],
        },
        { buildAcceptance: async () => assert.fail('planner must not run for invalid staging') },
    );
    assert.equal(await coordinator.planAcceptance(state.poolId), undefined);
});

test('coordinator rejects malformed state and quarantines duplicate staging outpoints', async () => {
    const deposit = makeStaging();
    const malformed = new V1Coordinator(
        {
            getPoolSnapshot: async () => ({ ...state, sequence: '0x00' as Hex }),
            listConfirmedStaging: async () => [deposit],
        },
        { buildAcceptance: async () => assert.fail('planner must not receive malformed state') },
    );
    await assert.rejects(() => malformed.planAcceptance(state.poolId), /canonical/i);

    const duplicate = new V1Coordinator(
        {
            getPoolSnapshot: async () => state,
            listConfirmedStaging: async () => [deposit, { ...deposit }],
        },
        { buildAcceptance: async () => assert.fail('planner must not receive duplicate cells') },
    );
    assert.equal(await duplicate.planAcceptance(state.poolId), undefined);
});

test('malformed and adversarial staging observations cannot block a valid deposit', async () => {
    const valid = makeStaging({ outPoint: { txHash: h('1'), index: q(1) } });
    const duplicate = makeStaging({ outPoint: { txHash: h('2'), index: q(2) } });
    const coordinator = new V1Coordinator(
        {
            getPoolSnapshot: async () => state,
            listConfirmedStaging: async () => [
                { malformed: true },
                makeStaging({ assetId: h('9') }),
                makeStaging({ outPoint: { txHash: h('0'), index: q(0) }, commitment: field(0) }),
                duplicate,
                { ...duplicate, commitment: field(19) },
                valid,
            ],
        },
        { buildAcceptance: async (_state, selected) => selected.map(item => item.outPoint) },
    );
    const plan = await coordinator.planAcceptance(state.poolId);
    assert.deepEqual(plan?.staging, [valid]);
});

test('coordinator deterministically caps an acceptance batch at sixteen cells', async () => {
    const discovered = Array.from({ length: 17 }, (_, index) => makeStaging({
        outPoint: { txHash: hashNumber(index + 1), index: q(index) },
        commitment: field(index + 1),
    })).reverse();
    const coordinator = new V1Coordinator(
        { getPoolSnapshot: async () => state, listConfirmedStaging: async () => discovered },
        { buildAcceptance: async (_state, selected) => ({ selected: selected.length }) },
    );
    const plan = await coordinator.planAcceptance(state.poolId);
    assert.equal(plan?.staging.length, 16);
    assert.deepEqual(plan?.transaction, { selected: 16 });
    assert.equal(plan?.staging.some(item => item.outPoint.txHash === hashNumber(17)), false);
});

test('relayer retains its nullifier lock when the broadcast result is inconsistent', async () => {
    const statuses: string[] = [];
    let releases = 0;
    let locked = false;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async () => assert.fail('invalid hash must not be observed') },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => ({
                feeShannons: 10n,
                protectedFields: { recipientDomain: field(9), actionHash: field(11) },
                privacyInputOutPoints: [state.poolState, state.vault], feeInputs: [],
                recipient: intent.recipient, transaction: {},
            }),
        },
        transactionInspector: { validate: async () => undefined },
        submitter: {
            transactionHash: async () => h('e'),
            submit: async () => '0xsubmitted_fake' as Hex,
        },
        operations: {
            acquireNullifier: async () => { if (locked) return false; locked = true; return true; },
            releaseNullifier: async () => { locked = false; releases += 1; },
            put: async operation => { statuses.push(operation.status); },
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /32-byte hex/);
    assert.deepEqual(statuses, ['queued', 'validated', 'submitted']);
    assert.equal(releases, 0);
    await assert.rejects(() => relayer.submit(intent), /already queued/);
});

test('relayer records a locally derived hash and retains the lock after a broadcast timeout', async () => {
    let locked = false;
    let releases = 0;
    let finalOperation;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async () => assert.fail('unconfirmed broadcast must not be observed yet') },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => ({
                feeShannons: 10n,
                protectedFields: { recipientDomain: field(9), actionHash: field(11) },
                privacyInputOutPoints: [state.poolState, state.vault], feeInputs: [],
                recipient: intent.recipient, transaction: { serialized: true },
            }),
        },
        transactionInspector: { validate: async () => undefined },
        submitter: {
            transactionHash: async transaction => {
                assert.deepEqual(transaction, { serialized: true });
                return h('e');
            },
            submit: async () => { throw new Error('RPC timed out after broadcast'); },
        },
        operations: {
            acquireNullifier: async () => { if (locked) return false; locked = true; return true; },
            releaseNullifier: async () => { locked = false; releases += 1; },
            put: async operation => { finalOperation = { ...operation }; },
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /timed out/);
    assert.equal(finalOperation?.status, 'submitted');
    assert.equal(finalOperation?.txHash, h('e'));
    assert.equal(releases, 0);
    await assert.rejects(() => relayer.submit(intent), /already queued/);
});

test('relayer never regresses a confirmed operation when committed-state persistence retries', async () => {
    let puts = 0;
    let releases = 0;
    let persisted;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async () => undefined },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => ({
                feeShannons: 10n,
                protectedFields: { recipientDomain: field(9), actionHash: field(11) },
                privacyInputOutPoints: [state.poolState, state.vault], feeInputs: [],
                recipient: intent.recipient, transaction: { serialized: true },
            }),
        },
        transactionInspector: { validate: async () => undefined },
        submitter: {
            transactionHash: async () => h('e'),
            submit: async () => h('e'),
        },
        operations: {
            acquireNullifier: async () => true,
            releaseNullifier: async () => { releases += 1; },
            put: async operation => {
                puts += 1;
                if (puts === 4) throw new Error('committed-state persistence failed');
                persisted = { ...operation };
            },
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /committed-state persistence failed/);
    assert.equal(puts, 5);
    assert.equal(persisted?.status, 'committed');
    assert.match(persisted?.error ?? '', /committed-state persistence failed/);
    assert.equal(releases, 0);
});

test('relayer fails closed when transaction bytes disagree with validated metadata', async () => {
    let submitted = false;
    let released = false;
    const relayer = new V1Relayer({
        chain: { getPoolSnapshot: async () => state, waitForCommitted: async () => undefined },
        planner: {
            deriveProtectedFields: async () => ({ recipientDomain: field(9), actionHash: field(11) }),
            reconstruct: async () => ({
                feeShannons: 1n,
                protectedFields: { recipientDomain: field(9), actionHash: field(11) },
                privacyInputOutPoints: [state.poolState, state.vault], feeInputs: [],
                recipient: intent.recipient,
                transaction: { actualRecipientData: '0xdeadbeef' },
            }),
        },
        transactionInspector: {
            validate: async (_intent, _state, plan) => {
                assert.deepEqual(plan.recipient, intent.recipient);
                throw new Error('materialized transaction changed protected recipient output');
            },
        },
        submitter: {
            transactionHash: async () => assert.fail('hashing must not run before inspection succeeds'),
            submit: async () => { submitted = true; return h('e'); },
        },
        operations: {
            acquireNullifier: async () => true,
            releaseNullifier: async () => { released = true; },
            put: async () => undefined,
            get: async () => undefined,
        },
    });
    await assert.rejects(() => relayer.submit(intent), /materialized transaction changed/);
    assert.equal(submitted, false);
    assert.equal(released, true);
});
