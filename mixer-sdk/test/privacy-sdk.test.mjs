import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Script } from '@ckb-ccc/core';
import {
    BN254_FQ_MODULUS,
    BN254_FR_MODULUS,
    InMemoryPrivacyStateStore,
    InvariantViolationError,
    SignerMismatchError,
    StaleStateError,
    UnsupportedOperationError,
    V1_DOMAIN_TAGS,
    V1_GROTH16_PROOF_ENCODING,
    V1_MERKLE_DEPTH,
    V1_MAX_ACCEPTED_STAGING,
    V1_PUBLIC_SIGNAL_ORDER,
    V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX,
    V1MerkleFrontier,
    assertAcceptanceTransition,
    assertDeploymentNetwork,
    assertPrivacyDeployment,
    assertFeeWithinLimit,
    assertFieldHex,
    assertFreshPoolState,
    assertProtocolSnapshot,
    assertUnspentNullifierProof,
    assertV1PoolConfig,
    assertV1Groth16Proof,
    assertV1WitnessMatchesStatement,
    assertWithdrawalTransition,
    buildV1MerkleTree,
    createPrivacyClient,
    createV1MerklePath,
    decodePoolTypeArgsV1,
    decodeV1Groth16Coordinates,
    decodeV1PublicSignals,
    deriveV1ActionHash,
    deriveV1AssetDomain,
    deriveV1AuthTag,
    deriveV1EmptyLeaf,
    deriveV1Leaf,
    deriveV1NullifierHash,
    deriveV1PoolDomain,
    deriveV1RecipientCtCommitmentHash,
    deriveV1RecipientCtDataHash,
    deriveV1RecipientDomain,
    encodeV1PublicSignals,
    fieldFromBigInt,
    fieldFromLeBytes,
    getV1EmptyRoots,
    openOwnedNote,
    materializeV1Transaction,
    poseidonHashBytes,
    sealOwnedNote,
    serializeV1WithdrawalIntent,
    signAndSendWithCcc,
    transitionNote,
    transitionOperation,
    verifyV1MerklePath,
} from '../dist/v1/index.js';
import {
    MemoryWithdrawalProvider,
    withdrawMix,
} from '../dist/legacy/index.js';

const [vector, scriptDomainVector, actionVector, relayerWireVector] = await Promise.all([
    readFile(new URL('../../circuits/v1/test-vectors/withdrawal.json', import.meta.url), 'utf8'),
    readFile(new URL('../test-vectors/script-domains.json', import.meta.url), 'utf8'),
    readFile(new URL('../test-vectors/withdrawal-action.json', import.meta.url), 'utf8'),
    readFile(new URL('../test-vectors/withdrawal-intent-wire.json', import.meta.url), 'utf8'),
]).then(files => files.map(JSON.parse));

const f = value => fieldFromBigInt(BigInt(value));
const h32 = byte => `0x${byte.repeat(64)}`;
const bytesHex = bytes => `0x${Buffer.from(bytes).toString('hex')}`;
const hexBytes = value => Uint8Array.from(Buffer.from(value.slice(2), 'hex'));

const HASH_TYPE_BYTES = Object.freeze({ data: 0, type: 1, data1: 2, data2: 4 });

function encodePoolTypeArgsV1(poolId, vaultLock, stagingLock) {
    const bytes = new Uint8Array(100);
    bytes[0] = 1;
    bytes.set(hexBytes(poolId), 2);
    bytes.set(hexBytes(vaultLock.codeHash), 34);
    bytes[66] = HASH_TYPE_BYTES[vaultLock.hashType];
    bytes.set(hexBytes(stagingLock.codeHash), 67);
    bytes[99] = HASH_TYPE_BYTES[stagingLock.hashType];
    return bytesHex(bytes);
}

function contractFixture(codeHashNibble, outPointNibble) {
    return {
        script: { codeHash: h32(codeHashNibble), hashType: 'type', args: '0x' },
        cellDep: { outPoint: { txHash: h32(outPointNibble), index: 0 }, depType: 'code' },
    };
}

function bigintToLe(value, length = 32) {
    const bytes = new Uint8Array(length);
    let remaining = value;
    for (let index = 0; index < length; index += 1) {
        bytes[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }
    return bytes;
}

function sharedStatement() {
    const publicSignals = {
        poolDomain: f(vector.publicSignals.poolDomain),
        assetDomain: f(vector.publicSignals.assetDomain),
        denomination: BigInt(vector.publicSignals.denomination),
        value: BigInt(vector.publicSignals.value),
        root: f(vector.publicSignals.root),
        nullifierHash: f(vector.publicSignals.nullifierHash),
        recipientDomain: f(vector.publicSignals.recipientDomain),
        actionHash: f(vector.publicSignals.actionHash),
        authTag: f(vector.publicSignals.authTag),
    };
    const witness = {
        secret: f(vector.privateWitness.secret),
        nullifierSecret: f(vector.privateWitness.nullifierSecret),
        pathElements: vector.privateWitness.pathElements.map(f),
        pathIndices: vector.privateWitness.pathIndices,
    };
    return { publicSignals, witness };
}

test('shared Circom vector matches SDK tags, hashes, path, and public ABI', async () => {
    assert.deepEqual([...V1_PUBLIC_SIGNAL_ORDER], vector.publicSignalOrder);
    for (const tag of ['leaf', 'nullifier', 'auth', 'merkleEmpty', 'merkleNode']) {
        assert.equal(BigInt(V1_DOMAIN_TAGS[tag]).toString(), vector.domainTags[tag]);
    }

    const { publicSignals, witness } = sharedStatement();
    const leaf = await deriveV1Leaf({
        poolDomain: publicSignals.poolDomain,
        assetDomain: publicSignals.assetDomain,
        denomination: publicSignals.denomination,
        secret: witness.secret,
        nullifierSecret: witness.nullifierSecret,
    });
    assert.equal(BigInt(leaf).toString(), vector.derived.leaf);
    assert.equal(BigInt(await deriveV1NullifierHash({
        poolDomain: publicSignals.poolDomain,
        nullifierSecret: witness.nullifierSecret,
        leafIndex: Number(vector.derived.leafIndex),
    })).toString(), vector.publicSignals.nullifierHash);
    assert.equal(BigInt(await deriveV1AuthTag({
        secret: witness.secret,
        recipientDomain: publicSignals.recipientDomain,
        actionHash: publicSignals.actionHash,
    })).toString(), vector.publicSignals.authTag);
    await assertV1WitnessMatchesStatement(publicSignals, witness);
    assert.equal(bytesHex(encodeV1PublicSignals(publicSignals)), vector.publicInputsLeHex);
    assert.deepEqual(decodeV1PublicSignals(encodeV1PublicSignals(publicSignals)), publicSignals);

    assert.equal(BigInt(await deriveV1EmptyLeaf(publicSignals.poolDomain)).toString(), vector.derived.emptyLeaf);
    const emptyRoots = await getV1EmptyRoots(publicSignals.poolDomain, V1_MERKLE_DEPTH);
    assert.equal(BigInt(emptyRoots[V1_MERKLE_DEPTH]).toString(), vector.derived.emptyRoot);
});

test('field and proof ABI decoders reject non-canonical encodings', async () => {
    assert.equal(assertFieldHex(`0x${'00'.repeat(32)}`), `0x${'00'.repeat(32)}`);
    assert.throws(() => assertFieldHex(`0x${BN254_FR_MODULUS.toString(16).padStart(64, '0')}`));
    assert.throws(() => assertFieldHex(`0X${'00'.repeat(32)}`));
    assert.throws(() => assertFieldHex('0x01'));
    assert.throws(() => fieldFromLeBytes(bigintToLe(BN254_FR_MODULUS)));

    const malformedProof = new Uint8Array(256);
    malformedProof.set(bigintToLe(BN254_FQ_MODULUS), 0);
    assert.throws(() => decodeV1Groth16Coordinates(malformedProof));

    const canonicalButInvalid = {
        encoding: V1_GROTH16_PROOF_ENCODING,
        bytes: new Uint8Array(256),
        publicSignals: sharedStatement().publicSignals,
    };
    let verifierCalled = false;
    await assert.rejects(
        assertV1Groth16Proof(canonicalButInvalid, {
            async verify() {
                verifierCalled = true;
                return false;
            },
        }),
        InvariantViolationError,
    );
    assert.equal(verifierCalled, true);
});

test('byte sponge and CCC Script domains bind exact canonical bytes', async () => {
    const trailingResults = [];
    for (const item of scriptDomainVector.trailingZeroVectors) {
        const result = await poseidonHashBytes(V1_DOMAIN_TAGS[item.domain], hexBytes(item.bytes));
        assert.equal(result, item.result);
        trailingResults.push(result);
    }
    assert.notEqual(trailingResults[0], trailingResults[1]);

    for (const kind of ['pool', 'asset', 'recipient']) {
        assert.equal(BigInt(V1_DOMAIN_TAGS[kind]).toString(), scriptDomainVector.domainTags[kind].decimal);
    }
    const base = {
        codeHash: scriptDomainVector.script.codeHash,
        hashType: scriptDomainVector.script.hashType,
        args: scriptDomainVector.script.args,
    };
    const changed = { ...base, args: scriptDomainVector.scriptMutation.args };
    assert.equal(bytesHex(Script.from(base).toBytes()), scriptDomainVector.script.moleculeBytes);
    assert.equal(bytesHex(Script.from(changed).toBytes()), scriptDomainVector.scriptMutation.moleculeBytes);
    assert.equal(await deriveV1PoolDomain(base), scriptDomainVector.domains.pool);
    assert.equal(await deriveV1AssetDomain(base), scriptDomainVector.domains.asset);
    assert.equal(await deriveV1RecipientDomain(base), scriptDomainVector.domains.recipient);
    assert.equal(
        await deriveV1RecipientDomain(changed),
        scriptDomainVector.scriptMutation.recipientDomain,
    );
    assert.equal(
        await deriveV1RecipientDomain(base),
        await deriveV1RecipientDomain(Script.from(base)),
    );
});

test('Merkle tree, path, and frontier agree and reject mutations', async () => {
    const poolDomain = f(101);
    const leaves = [f(11), f(12), f(13), f(14), f(15)];
    const tree = await buildV1MerkleTree(poolDomain, leaves);
    const path = await createV1MerklePath(tree, 3);
    assert.equal(await verifyV1MerklePath(poolDomain, path), true);
    assert.equal(await verifyV1MerklePath(poolDomain, { ...path, root: f(999) }), false);
    await assert.rejects(
        verifyV1MerklePath(poolDomain, { ...path, pathIndices: [0, ...path.pathIndices.slice(1)] }),
        InvariantViolationError,
    );

    const frontier = await V1MerkleFrontier.create(poolDomain);
    for (let index = 0; index < leaves.length; index += 1) {
        const append = await frontier.append(leaves[index]);
        const prefixTree = await buildV1MerkleTree(poolDomain, leaves.slice(0, index + 1));
        assert.equal(append.root, prefixTree.root);
    }
});

test('withdrawal action hash binds every protected field', async () => {
    const fixture = actionVector.context;
    const context = {
        kind: fixture.kind,
        poolDomain: f(fixture.poolDomain),
        assetDomain: f(fixture.assetDomain),
        denomination: BigInt(fixture.denomination),
        value: BigInt(fixture.value),
        acceptedRoot: f(fixture.acceptedRoot),
        nullifierHash: f(fixture.nullifierHash),
        currentStateSequence: BigInt(fixture.currentStateSequence),
        nextStateSequence: BigInt(fixture.nextStateSequence),
        recipientDomain: f(fixture.recipientDomain),
        recipientCtCommitmentHash: f(fixture.recipientCtCommitmentHash),
        recipientCtDataHash: f(fixture.recipientCtDataHash),
        recipientOutputIndex: fixture.recipientOutputIndex,
        recipientOutputCapacity: BigInt(fixture.recipientOutputCapacity),
        vaultInputAmount: BigInt(fixture.vaultInputAmount),
        vaultOutputAmount: BigInt(fixture.vaultOutputAmount),
    };
    const expected = await deriveV1ActionHash(context);
    assert.equal(expected, actionVector.actionHash.hex);
    assert.equal(BigInt(expected).toString(), actionVector.actionHash.decimal);
    const hashMutations = [
        ['poolDomain', f(101)],
        ['assetDomain', f(102)],
        ['acceptedRoot', f(103)],
        ['nullifierHash', f(104)],
        ['recipientDomain', f(105)],
        ['recipientCtCommitmentHash', f(106)],
        ['recipientCtDataHash', f(107)],
        ['recipientOutputCapacity', 14_200_000_001n],
    ];
    for (const [field, value] of hashMutations) {
        assert.notEqual(await deriveV1ActionHash({ ...context, [field]: value }), expected, field);
    }
    const invariantMutations = [
        ['denomination', 101n],
        ['value', 101n],
        ['currentStateSequence', 8n],
        ['nextStateSequence', 11n],
        ['recipientOutputIndex', 3],
        ['vaultInputAmount', 501n],
        ['vaultOutputAmount', 399n],
    ];
    for (const [field, value] of invariantMutations) {
        await assert.rejects(deriveV1ActionHash({ ...context, [field]: value }), undefined, field);
    }
    await assert.rejects(deriveV1ActionHash({ ...context, kind: 'accept' }));
    const acceptance = {
        ...context,
        kind: 'accept',
        vaultOutputAmount: 600n,
    };
    assert.notEqual(await deriveV1ActionHash(acceptance), expected);
    const coveredFields = [
        'kind',
        ...hashMutations.map(([field]) => field),
        ...invariantMutations.map(([field]) => field),
    ].sort();
    assert.deepEqual(coveredFields, [...actionVector.mutationFields].sort());
});

test('CCC transaction materialization verifies the actual protected recipient output', async () => {
    const poolId = h32('a');
    const assetType = { codeHash: h32('2'), hashType: 'type', args: '0x1234' };
    const pool = {
        id: poolId,
        poolDomain: f(1),
        assetId: Script.from(assetType).hash(),
        assetDomain: f(2),
        denomination: 100n,
        treeDepth: 20,
        rootHistorySize: 8,
    };
    const recipientLock = { codeHash: h32('3'), hashType: 'type', args: '0xabcd' };
    const commitment = Uint8Array.from([9, 8, 7, 6]);
    const outputData = new Uint8Array(16 + commitment.length);
    outputData.set(bigintToLe(100n, 16));
    outputData.set(commitment, 16);
    const capacity = 14_200_000_000n;
    const expectedStateInput = { txHash: h32('4'), index: 0 };
    const expectedVaultInput = { txHash: h32('5'), index: 0 };
    const actionContext = {
        kind: 'withdraw',
        poolDomain: pool.poolDomain,
        assetDomain: pool.assetDomain,
        denomination: 100n,
        value: 100n,
        acceptedRoot: f(5),
        nullifierHash: f(6),
        currentStateSequence: 1n,
        nextStateSequence: 2n,
        recipientDomain: await deriveV1RecipientDomain(recipientLock),
        recipientCtCommitmentHash: await deriveV1RecipientCtCommitmentHash(commitment),
        recipientCtDataHash: await deriveV1RecipientCtDataHash(outputData),
        recipientOutputIndex: V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX,
        recipientOutputCapacity: capacity,
        vaultInputAmount: 500n,
        vaultOutputAmount: 400n,
    };
    const paddingOutput = { capacity: 0n, lock: recipientLock };
    const transaction = {
        inputs: [
            { previousOutput: expectedStateInput, since: 0 },
            { previousOutput: expectedVaultInput, since: 0 },
        ],
        outputs: [paddingOutput, paddingOutput, { capacity, lock: recipientLock, type: assetType }],
        outputsData: ['0x', '0x', bytesHex(outputData)],
    };
    const codec = {
        encoding: 'test-ct-v1',
        decodeRecipientOutputData(data) {
            return { value: BigInt(`0x${Buffer.from(data.slice(0, 16)).reverse().toString('hex')}`), commitment: data.slice(16) };
        },
    };
    const plan = {
        poolId,
        pool,
        expectedStateInput,
        expectedVaultInput,
        actionContext,
        actionHash: await deriveV1ActionHash(actionContext),
        transaction,
    };
    await assert.doesNotReject(materializeV1Transaction(plan, codec));
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: { ...transaction, inputs: [{ previousOutput: { txHash: h32('9'), index: 0 } }] },
    }, codec), InvariantViolationError);
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: {
            ...transaction,
            inputs: [{ previousOutput: expectedStateInput, since: 0 }],
        },
    }, codec), InvariantViolationError);
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: {
            ...transaction,
            inputs: [
                { previousOutput: expectedStateInput, since: 0 },
                { previousOutput: { txHash: h32('9'), index: 0 }, since: 0 },
            ],
        },
    }, codec), InvariantViolationError);
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: {
            ...transaction,
            inputs: [
                ...transaction.inputs,
                { previousOutput: expectedVaultInput, since: 0 },
            ],
        },
    }, codec), InvariantViolationError);
    await assert.rejects(materializeV1Transaction({
        ...plan,
        expectedVaultInput: expectedStateInput,
    }, codec), InvariantViolationError);
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: {
            ...transaction,
            outputs: transaction.outputs.map((output, index) => index === V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX
                ? { ...output, lock: { ...recipientLock, args: '0xabce' } }
                : output),
        },
    }, codec), InvariantViolationError);
    const mutatedData = Uint8Array.from(outputData);
    mutatedData[mutatedData.length - 1] ^= 1;
    await assert.rejects(materializeV1Transaction({
        ...plan,
        transaction: {
            ...transaction,
            outputsData: transaction.outputsData.map((data, index) =>
                index === V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX ? bytesHex(mutatedData) : data),
        },
    }, codec), InvariantViolationError);
});

test('relayer serializer matches the canonical backend withdrawal DTO', () => {
    const { publicSignals } = sharedStatement();
    const proof = {
        encoding: V1_GROTH16_PROOF_ENCODING,
        bytes: Uint8Array.from({ length: 256 }, () => 1),
        publicSignals,
    };
    const intent = {
        poolId: h32('a'),
        expectedState: {
            sequence: 9n,
            poolState: { txHash: h32('c'), index: 0 },
            vault: { txHash: h32('d'), index: 1 },
            root: publicSignals.root,
            vaultValue: 500n,
        },
        recipient: {
            lock: { codeHash: h32('1'), hashType: 'type', args: '0xabcd' },
            ctType: { codeHash: h32('2'), hashType: 'type', args: '0x1234' },
            capacity: 14_200_000_000n,
            data: hexBytes(relayerWireVector.recipient.data),
        },
        publicSignals,
        proof,
        maxFeeShannons: 1_000n,
    };
    assert.equal(actionVector.context.recipientOutputIndex, V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX);
    assert.deepEqual(serializeV1WithdrawalIntent(intent), relayerWireVector);
    assert.throws(() => serializeV1WithdrawalIntent({
        ...intent,
        expectedState: { ...intent.expectedState, root: f(999) },
    }), InvariantViolationError);
    assert.throws(() => serializeV1WithdrawalIntent({
        ...intent,
        proof: { ...proof, publicSignals: { ...publicSignals, actionHash: f(999) } },
    }), InvariantViolationError);
    assert.throws(() => serializeV1WithdrawalIntent({
        ...intent,
        maxFeeShannons: -1n,
    }));
    assert.equal(serializeV1WithdrawalIntent({
        ...intent,
        recipient: {
            ...intent.recipient,
            lock: { ...intent.recipient.lock, hashType: 'data2' },
        },
    }).recipient.lock.hashType, 'data2');
});

function stateFixtures() {
    const pool = {
        id: h32('a'),
        poolDomain: f(1),
        assetId: h32('b'),
        assetDomain: f(2),
        denomination: 100n,
        treeDepth: 20,
        rootHistorySize: 8,
    };
    const previousState = {
        version: 1,
        poolId: pool.id,
        assetId: pool.assetId,
        denomination: 100n,
        sequence: 7n,
        commitmentRoot: f(10),
        nullifierRoot: f(20),
        nextLeafIndex: 4,
        outstandingCount: 4n,
        outstandingValue: 400n,
        frontier: Array.from({ length: V1_MERKLE_DEPTH }, () => f(0)),
        acceptedRoots: [f(10)],
        outPoint: { txHash: h32('c'), index: 0 },
    };
    const previousVault = {
        version: 1,
        poolId: pool.id,
        assetId: pool.assetId,
        amount: 400n,
        outPoint: { txHash: h32('d'), index: 0 },
    };
    return { pool, previousState, previousVault };
}

test('pool and Vault transition invariants enforce CT conservation', () => {
    const { pool, previousState, previousVault } = stateFixtures();
    assert.doesNotThrow(() => assertAcceptanceTransition({
        pool,
        previousState,
        nextState: {
            ...previousState,
            sequence: 8n,
            commitmentRoot: f(11),
            nextLeafIndex: 5,
            outstandingCount: 5n,
            outstandingValue: 500n,
            frontier: [f(11), ...previousState.frontier.slice(1)],
            acceptedRoots: [f(10), f(11)],
        },
        previousVault,
        nextVault: { ...previousVault, amount: 500n },
    }));
    assert.throws(() => assertAcceptanceTransition({
        pool,
        previousState,
        nextState: { ...previousState, sequence: 8n, commitmentRoot: f(11), nextLeafIndex: 5 },
        previousVault,
        nextVault: { ...previousVault, amount: 501n },
    }), InvariantViolationError);

    const batchedAcceptance = batchSize => ({
        pool,
        previousState,
        nextState: {
            ...previousState,
            sequence: 8n,
            commitmentRoot: f(12),
            nextLeafIndex: previousState.nextLeafIndex + batchSize,
            outstandingCount: previousState.outstandingCount + BigInt(batchSize),
            outstandingValue: previousState.outstandingValue + 100n * BigInt(batchSize),
            frontier: [f(12), ...previousState.frontier.slice(1)],
            acceptedRoots: [f(10), f(12)],
        },
        previousVault,
        nextVault: { ...previousVault, amount: previousVault.amount + 100n * BigInt(batchSize) },
    });
    assert.doesNotThrow(() => assertAcceptanceTransition(batchedAcceptance(2)));
    assert.doesNotThrow(() => assertAcceptanceTransition(batchedAcceptance(V1_MAX_ACCEPTED_STAGING)));
    assert.throws(
        () => assertAcceptanceTransition(batchedAcceptance(V1_MAX_ACCEPTED_STAGING + 1)),
        InvariantViolationError,
    );

    assert.doesNotThrow(() => assertWithdrawalTransition({
        pool,
        previousState,
        nextState: {
            ...previousState,
            sequence: 8n,
            nullifierRoot: f(21),
            outstandingCount: 3n,
            outstandingValue: 300n,
        },
        previousVault,
        nextVault: { ...previousVault, amount: 300n },
    }));
    assert.throws(() => assertWithdrawalTransition({
        pool,
        previousState,
        nextState: {
            ...previousState,
            sequence: 8n,
            nullifierRoot: f(21),
            outstandingCount: 3n,
            outstandingValue: 300n,
        },
        previousVault,
        nextVault: { ...previousVault, amount: 400n },
    }), InvariantViolationError);
});

test('transition validators reject state boundary overflow and malformed identities', () => {
    const { pool, previousState, previousVault } = stateFixtures();
    const acceptanceFrom = (sourceState, sourceVault, selectedPool = pool) => {
        const nextRoot = f(500);
        const nextState = {
            ...sourceState,
            sequence: sourceState.sequence + 1n,
            commitmentRoot: nextRoot,
            nextLeafIndex: sourceState.nextLeafIndex + 1,
            outstandingCount: sourceState.outstandingCount + 1n,
            outstandingValue: sourceState.outstandingValue + selectedPool.denomination,
            frontier: [nextRoot, ...sourceState.frontier.slice(1)],
            acceptedRoots: sourceState.acceptedRoots.length < selectedPool.rootHistorySize
                ? [...sourceState.acceptedRoots, nextRoot]
                : [...sourceState.acceptedRoots.slice(1), nextRoot],
        };
        return {
            pool: selectedPool,
            previousState: sourceState,
            nextState,
            previousVault: sourceVault,
            nextVault: {
                ...sourceVault,
                amount: sourceVault.amount + selectedPool.denomination,
            },
        };
    };

    const fullTreeState = { ...previousState, nextLeafIndex: 2 ** V1_MERKLE_DEPTH };
    assert.throws(
        () => assertAcceptanceTransition(acceptanceFrom(fullTreeState, previousVault)),
        InvariantViolationError,
    );

    const maxU64 = (1n << 64n) - 1n;
    assert.throws(() => assertAcceptanceTransition(acceptanceFrom(
        { ...previousState, sequence: maxU64 },
        previousVault,
    )));
    assert.throws(() => assertWithdrawalTransition({
        pool,
        previousState: { ...previousState, outstandingCount: 1n << 64n },
        nextState: {
            ...previousState,
            sequence: 8n,
            nullifierRoot: f(21),
            outstandingCount: 3n,
            outstandingValue: 300n,
        },
        previousVault,
        nextVault: { ...previousVault, amount: 300n },
    }));

    const maxU128 = (1n << 128n) - 1n;
    const widePool = { ...pool, denomination: maxU128 };
    const wideState = {
        ...previousState,
        denomination: maxU128,
        nextLeafIndex: 1,
        outstandingCount: 1n,
        outstandingValue: maxU128,
    };
    const wideVault = { ...previousVault, amount: maxU128 };
    assert.throws(() => assertAcceptanceTransition(acceptanceFrom(wideState, wideVault, widePool)));

    const maxHistoryPool = { ...pool, rootHistorySize: 32 };
    const fullHistory = Array.from({ length: 32 }, (_, index) => f(600 + index));
    const historyState = {
        ...previousState,
        commitmentRoot: fullHistory.at(-1),
        acceptedRoots: fullHistory,
    };
    const historyTransition = acceptanceFrom(historyState, previousVault, maxHistoryPool);
    assert.doesNotThrow(() => assertAcceptanceTransition(historyTransition));
    assert.throws(() => assertAcceptanceTransition({
        ...historyTransition,
        nextState: {
            ...historyTransition.nextState,
            acceptedRoots: [...fullHistory, historyTransition.nextState.commitmentRoot],
        },
    }), InvariantViolationError);

    assert.throws(() => assertAcceptanceTransition({
        ...acceptanceFrom(previousState, previousVault),
        previousVault: { ...previousVault, outPoint: previousState.outPoint },
    }), InvariantViolationError);
    assert.throws(() => assertV1PoolConfig({ ...pool, id: h32('0') }));
    assert.throws(() => assertV1PoolConfig({ ...pool, assetId: h32('0') }));
});

test('protocol snapshot requires the current root in a non-empty accepted window', () => {
    const { pool, previousState, previousVault } = stateFixtures();
    const base = {
        pool,
        state: previousState,
        vault: previousVault,
        blockHash: h32('e'),
        blockNumber: 1n,
    };
    assert.doesNotThrow(() => assertProtocolSnapshot(base));
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        state: { ...previousState, acceptedRoots: [] },
    }), InvariantViolationError);
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        state: { ...previousState, acceptedRoots: [f(999)] },
    }), InvariantViolationError);
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        state: { ...previousState, acceptedRoots: [previousState.commitmentRoot, f(999)] },
    }), InvariantViolationError);
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        state: { ...previousState, frontier: previousState.frontier.slice(1) },
    }), InvariantViolationError);
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        state: { ...previousState, outstandingValue: 300n },
    }), InvariantViolationError);
    assert.throws(() => assertProtocolSnapshot({
        ...base,
        vault: { ...previousVault, amount: 300n },
    }), InvariantViolationError);
});

test('fee, stale-state, and nullifier validators fail closed', async () => {
    const { previousState } = stateFixtures();
    assert.doesNotThrow(() => assertFeeWithinLimit(10n, 10n));
    assert.throws(() => assertFeeWithinLimit(11n, 10n), InvariantViolationError);
    assert.doesNotThrow(() => assertFreshPoolState(previousState, {
        sequence: previousState.sequence,
        outPoint: previousState.outPoint,
    }));
    assert.throws(() => assertFreshPoolState(previousState, {
        sequence: previousState.sequence + 1n,
        outPoint: previousState.outPoint,
    }), StaleStateError);

    const proof = {
        key: f(90),
        root: f(91),
        isSpent: false,
        proof: Uint8Array.of(1),
    };
    await assert.doesNotReject(assertUnspentNullifierProof(
        proof.root,
        proof.key,
        proof,
        { async verify() { return true; } },
    ));
    await assert.rejects(assertUnspentNullifierProof(
        proof.root,
        proof.key,
        proof,
        { async verify() { return false; } },
    ), InvariantViolationError);
});

async function clientFixture() {
    const poolId = h32('a');
    const contracts = {
        poolState: contractFixture('1', '1'),
        vault: contractFixture('3', '3'),
        stagingDeposit: contractFixture('4', '4'),
        nullifier: contractFixture('5', '5'),
        ctToken: contractFixture('8', '8'),
        verifier: contractFixture('9', '9'),
    };
    const poolType = {
        ...contracts.poolState.script,
        args: encodePoolTypeArgsV1(
            poolId,
            contracts.vault.script,
            contracts.stagingDeposit.script,
        ),
    };
    const assetType = { codeHash: h32('8'), hashType: 'type', args: '0x1234' };
    const assetId = Script.from(assetType).hash();
    const poolDomain = await deriveV1PoolDomain(poolType);
    const assetDomain = await deriveV1AssetDomain(assetType);
    const pool = {
        id: poolId,
        poolDomain,
        assetId,
        assetDomain,
        denomination: 100n,
        treeDepth: 20,
        rootHistorySize: 8,
        poolType,
        assetType,
    };
    const deployment = {
        protocolVersion: 'obscell-v1',
        network: 'test',
        genesisHash: h32('e'),
        addressPrefix: 'ckt',
        contracts,
        pools: [pool],
    };
    const client = {
        addressPrefix: 'ckt',
        async getCellLive() { return undefined; },
        async getBlockByNumber(number) {
            assert.equal(number, 0n);
            return { header: { hash: h32('e') } };
        },
        async sendTransaction() { return h32('9'); },
    };
    const store = new InMemoryPrivacyStateStore();
    const stagedNote = {
        version: 1,
        id: 'note-1',
        poolId,
        commitment: f(44),
        secret: f(45),
        nullifierSecret: f(46),
        state: 'staged',
        createdAt: 1,
    };
    await store.putNote(stagedNote);
    const root = f(55);
    const snapshot = {
        pool,
        state: {
            version: 1,
            poolId,
            assetId,
            denomination: 100n,
            sequence: 1n,
            commitmentRoot: root,
            nullifierRoot: f(56),
            nextLeafIndex: 1,
            outstandingCount: 1n,
            outstandingValue: 100n,
            frontier: Array.from({ length: V1_MERKLE_DEPTH }, () => f(0)),
            acceptedRoots: [root],
            outPoint: { txHash: h32('5'), index: 0 },
        },
        vault: {
            version: 1,
            poolId,
            assetId,
            amount: 100n,
            outPoint: { txHash: h32('6'), index: 0 },
        },
        blockHash: h32('7'),
        blockNumber: 100n,
    };
    const indexer = {
        async syncPool(input) {
            assert.equal(input.client, client);
            return {
                snapshot,
                noteUpdates: [{ commitment: stagedNote.commitment, state: 'accepted', leafIndex: 0, acceptedRoot: root }],
            };
        },
    };
    const stateVerifier = {
        async verifyPoolSync(input) {
            assert.equal(input.client, client);
            assert.equal(input.result.snapshot, snapshot);
            assert.equal(input.localNotes.length, 1);
            assert.equal('secret' in input.localNotes[0], false);
            assert.equal('nullifierSecret' in input.localNotes[0], false);
        },
    };
    return { pool, client, store, deployment, indexer, stateVerifier, snapshot };
}

test('PoolTypeArgsV1 decoder matches the fixed 100-byte contract wire schema', async () => {
    const fixture = await clientFixture();
    const decoded = decodePoolTypeArgsV1(fixture.pool.poolType.args);
    assert.deepEqual(decoded, {
        version: 1,
        typeId: fixture.pool.id,
        vaultLock: {
            codeHash: fixture.deployment.contracts.vault.script.codeHash,
            hashType: fixture.deployment.contracts.vault.script.hashType,
        },
        stagingLock: {
            codeHash: fixture.deployment.contracts.stagingDeposit.script.codeHash,
            hashType: fixture.deployment.contracts.stagingDeposit.script.hashType,
        },
    });
    assert.doesNotThrow(() => assertPrivacyDeployment(fixture.deployment));
    assert.throws(() => decodePoolTypeArgsV1(fixture.pool.id));

    const wrongVersion = hexBytes(fixture.pool.poolType.args);
    wrongVersion[0] = 2;
    assert.throws(() => decodePoolTypeArgsV1(bytesHex(wrongVersion)));

    const invalidHashType = hexBytes(fixture.pool.poolType.args);
    invalidHashType[66] = 3;
    assert.throws(() => decodePoolTypeArgsV1(bytesHex(invalidHashType)));

    assert.throws(() => assertPrivacyDeployment({
        ...fixture.deployment,
        contracts: {
            ...fixture.deployment.contracts,
            vault: contractFixture('9', '9'),
        },
    }), InvariantViolationError);
    assert.throws(() => assertPrivacyDeployment({
        ...fixture.deployment,
        contracts: {
            ...fixture.deployment.contracts,
            ctToken: contractFixture('6', '6'),
        },
    }), InvariantViolationError);
    await assert.doesNotReject(assertDeploymentNetwork(fixture.deployment, fixture.client));
    await assert.rejects(assertDeploymentNetwork(fixture.deployment, {
        ...fixture.client,
        async getBlockByNumber() { return { header: { hash: h32('f') } }; },
    }), InvariantViolationError);
});

test('PrivacyClient uses injected boundaries and exposes no note secrets', async () => {
    const fixture = await clientFixture();
    const privacy = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: { indexer: fixture.indexer, stateVerifier: fixture.stateVerifier },
    });
    const capabilities = await privacy.getCapabilities();
    assert.equal(capabilities.sync, 'supported');
    assert.equal(capabilities.shield, 'unavailable');
    assert.equal(capabilities.privateStateProtection, 'memory-only');
    await privacy.sync({ poolId: fixture.pool.id });
    const notes = await privacy.listNotes({ poolId: fixture.pool.id });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].spendable, true);
    assert.equal('secret' in notes[0], false);
    assert.equal('nullifierSecret' in notes[0], false);
    assert.deepEqual(await privacy.getPrivateBalance({ poolId: fixture.pool.id }), {
        poolId: fixture.pool.id,
        assetId: fixture.pool.assetId,
        denomination: 100n,
        amount: 100n,
        noteCount: 1,
        stateSequence: 1n,
    });

    const wrongSigner = { client: { ...fixture.client }, async sendTransaction() { return h32('8'); } };
    await assert.rejects(
        () => privacy.shield({ poolId: fixture.pool.id, signer: wrongSigner }),
        SignerMismatchError,
    );
    const signer = { client: fixture.client, async sendTransaction() { return h32('8'); } };
    await assert.rejects(
        () => privacy.shield({ poolId: fixture.pool.id, signer }),
        UnsupportedOperationError,
    );
});

test('an injected prover is not advertised before a callable proof workflow exists', async () => {
    const fixture = await clientFixture();
    const privacy = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        prover: {
            scheme: 'groth16-bn254',
            async prove() { assert.fail('capability inspection must not invoke the prover'); },
            async verify() { assert.fail('capability inspection must not invoke the verifier'); },
        },
    });
    const capabilities = await privacy.getCapabilities();
    assert.equal(capabilities.localProofGeneration, 'unavailable');
    assert.match(capabilities.limitations.join('\n'), /no callable corrected-V1 proof workflow/);
});

test('PrivacyClient never commits unverified indexer observations', async () => {
    const fixture = await clientFixture();
    const withoutVerifier = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: { indexer: fixture.indexer },
    });
    assert.equal((await withoutVerifier.getCapabilities()).sync, 'unavailable');
    await assert.rejects(
        withoutVerifier.sync({ poolId: fixture.pool.id }),
        UnsupportedOperationError,
    );
    assert.equal((await fixture.store.getNote('note-1')).state, 'staged');
    assert.equal(await fixture.store.getPoolSnapshot(fixture.pool.id), undefined);

    const rejectingVerifier = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: {
            indexer: fixture.indexer,
            stateVerifier: {
                async verifyPoolSync() {
                    throw new InvariantViolationError('forged indexer evidence');
                },
            },
        },
    });
    await assert.rejects(
        rejectingVerifier.sync({ poolId: fixture.pool.id }),
        InvariantViolationError,
    );
    assert.equal((await fixture.store.getNote('note-1')).state, 'staged');
    assert.equal(await fixture.store.getPoolSnapshot(fixture.pool.id), undefined);
});

test('expired accepted roots do not poison verified sync or inflate spendable balance', async () => {
    const fixture = await clientFixture();
    const expiredRoot = fixture.snapshot.state.commitmentRoot;
    const retainedRoots = Array.from({ length: fixture.pool.rootHistorySize }, (_, index) => f(60 + index));
    const rolledSnapshot = {
        ...fixture.snapshot,
        state: {
            ...fixture.snapshot.state,
            sequence: 9n,
            commitmentRoot: retainedRoots.at(-1),
            nextLeafIndex: 9,
            outstandingCount: 9n,
            outstandingValue: 900n,
            frontier: [retainedRoots.at(-1), ...fixture.snapshot.state.frontier.slice(1)],
            acceptedRoots: retainedRoots,
            outPoint: { txHash: h32('b'), index: 0 },
        },
        vault: {
            ...fixture.snapshot.vault,
            amount: 900n,
            outPoint: { txHash: h32('d'), index: 0 },
        },
        blockHash: h32('f'),
        blockNumber: 109n,
    };
    let updateState = 'accepted';
    let verifierCalls = 0;
    const privacy = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: {
            indexer: {
                async syncPool() {
                    return {
                        snapshot: rolledSnapshot,
                        noteUpdates: [{
                            commitment: f(44),
                            state: updateState,
                            leafIndex: 0,
                            acceptedRoot: expiredRoot,
                        }],
                    };
                },
            },
            stateVerifier: {
                async verifyPoolSync(input) {
                    verifierCalls += 1;
                    assert.equal('secret' in input.localNotes[0], false);
                    assert.equal('nullifierSecret' in input.localNotes[0], false);
                    const persisted = await fixture.store.getNote('note-1');
                    assert.equal(persisted.state, verifierCalls === 1 ? 'staged' : 'accepted');
                },
            },
        },
    });

    await assert.doesNotReject(privacy.sync({ poolId: fixture.pool.id }));
    const [metadata] = await privacy.listNotes({ poolId: fixture.pool.id });
    assert.equal(metadata.state, 'accepted');
    assert.equal(metadata.proofStatus, 'root-expired');
    assert.equal(metadata.spendable, false);
    assert.deepEqual(await privacy.getPrivateBalance({ poolId: fixture.pool.id }), {
        poolId: fixture.pool.id,
        assetId: fixture.pool.assetId,
        denomination: 100n,
        amount: 0n,
        noteCount: 0,
        stateSequence: 9n,
    });

    updateState = 'spent';
    await assert.doesNotReject(privacy.sync({ poolId: fixture.pool.id }));
    assert.equal((await fixture.store.getNote('note-1')).state, 'spent');
    assert.equal(verifierCalls, 2);
});

test('PrivacyClient serializes sync per pool and releases the queue after failure', async () => {
    const fixture = await clientFixture();
    let releaseFirst;
    let markFirstStarted;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
    const secondRoot = f(58);
    const secondSnapshot = {
        ...fixture.snapshot,
        state: {
            ...fixture.snapshot.state,
            sequence: 2n,
            commitmentRoot: secondRoot,
            nextLeafIndex: 2,
            outstandingCount: 2n,
            outstandingValue: 200n,
            frontier: [secondRoot, ...fixture.snapshot.state.frontier.slice(1)],
            acceptedRoots: [fixture.snapshot.state.commitmentRoot, secondRoot],
            outPoint: { txHash: h32('b'), index: 0 },
        },
        vault: {
            ...fixture.snapshot.vault,
            amount: 200n,
            outPoint: { txHash: h32('d'), index: 0 },
        },
        blockHash: h32('f'),
        blockNumber: 101n,
    };
    let calls = 0;
    const previousSnapshots = [];
    const privacy = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: {
            indexer: {
                async syncPool(input) {
                    calls += 1;
                    previousSnapshots.push(input.previousSnapshot);
                    if (calls === 1) {
                        markFirstStarted();
                        await firstGate;
                        return { snapshot: fixture.snapshot, noteUpdates: [] };
                    }
                    return { snapshot: secondSnapshot, noteUpdates: [] };
                },
            },
            stateVerifier: {
                async verifyPoolSync(input) {
                    assert.equal('secret' in input.localNotes[0], false);
                },
            },
        },
    });

    const first = privacy.sync({ poolId: fixture.pool.id });
    await firstStarted;
    const second = privacy.sync({ poolId: fixture.pool.id });
    await Promise.resolve();
    assert.equal(calls, 1);
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.state.sequence, 1n);
    assert.equal(secondResult.state.sequence, 2n);
    assert.equal(previousSnapshots[0], undefined);
    assert.equal(previousSnapshots[1].state.sequence, 1n);
    assert.equal((await fixture.store.getPoolSnapshot(fixture.pool.id)).state.sequence, 2n);

    const recoveryFixture = await clientFixture();
    let releaseFailure;
    let markFailureStarted;
    const failureGate = new Promise(resolve => { releaseFailure = resolve; });
    const failureStarted = new Promise(resolve => { markFailureStarted = resolve; });
    let recoveryCalls = 0;
    const recovering = createPrivacyClient({
        client: recoveryFixture.client,
        deployment: recoveryFixture.deployment,
        stateStore: recoveryFixture.store,
        services: {
            indexer: {
                async syncPool() {
                    recoveryCalls += 1;
                    if (recoveryCalls === 1) {
                        markFailureStarted();
                        await failureGate;
                        throw new Error('first sync failed');
                    }
                    return { snapshot: recoveryFixture.snapshot, noteUpdates: [] };
                },
            },
            stateVerifier: recoveryFixture.stateVerifier,
        },
    });
    const failed = assert.rejects(
        recovering.sync({ poolId: recoveryFixture.pool.id }),
        /first sync failed/,
    );
    await failureStarted;
    const recovered = recovering.sync({ poolId: recoveryFixture.pool.id });
    releaseFailure();
    await failed;
    await assert.doesNotReject(recovered);
    assert.equal(recoveryCalls, 2);
});

test('shared state store CAS prevents stale commits across PrivacyClient instances', async () => {
    const fixture = await clientFixture();
    const newerRoot = f(58);
    const retryRoot = f(59);
    const newerSnapshot = {
        ...fixture.snapshot,
        state: {
            ...fixture.snapshot.state,
            sequence: 2n,
            commitmentRoot: newerRoot,
            nextLeafIndex: 2,
            outstandingCount: 2n,
            outstandingValue: 200n,
            frontier: [newerRoot, ...fixture.snapshot.state.frontier.slice(1)],
            acceptedRoots: [fixture.snapshot.state.commitmentRoot, newerRoot],
            outPoint: { txHash: h32('b'), index: 0 },
        },
        vault: {
            ...fixture.snapshot.vault,
            amount: 200n,
            outPoint: { txHash: h32('d'), index: 0 },
        },
        blockHash: h32('f'),
        blockNumber: 101n,
    };
    const retrySnapshot = {
        ...newerSnapshot,
        state: {
            ...newerSnapshot.state,
            sequence: 3n,
            commitmentRoot: retryRoot,
            nextLeafIndex: 3,
            outstandingCount: 3n,
            outstandingValue: 300n,
            frontier: [retryRoot, ...newerSnapshot.state.frontier.slice(1)],
            acceptedRoots: [...newerSnapshot.state.acceptedRoots, retryRoot],
            outPoint: { txHash: h32('c'), index: 0 },
        },
        vault: {
            ...newerSnapshot.vault,
            amount: 300n,
            outPoint: { txHash: h32('e'), index: 0 },
        },
        blockHash: h32('1'),
        blockNumber: 102n,
    };
    const noteUpdate = acceptedRoot => [{
        commitment: f(44),
        state: 'accepted',
        leafIndex: 0,
        acceptedRoot,
    }];

    let releaseOlder;
    let markOlderVerifierStarted;
    const olderGate = new Promise(resolve => { releaseOlder = resolve; });
    const olderVerifierStarted = new Promise(resolve => { markOlderVerifierStarted = resolve; });
    let olderCalls = 0;
    let olderVerifierCalls = 0;
    const olderClient = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: {
            indexer: {
                async syncPool(input) {
                    olderCalls += 1;
                    if (olderCalls === 1) {
                        assert.equal(input.previousSnapshot, undefined);
                        return {
                            snapshot: fixture.snapshot,
                            noteUpdates: noteUpdate(fixture.snapshot.state.commitmentRoot),
                        };
                    }
                    assert.equal(input.previousSnapshot.state.sequence, 2n);
                    return { snapshot: retrySnapshot, noteUpdates: noteUpdate(retryRoot) };
                },
            },
            stateVerifier: {
                async verifyPoolSync() {
                    olderVerifierCalls += 1;
                    if (olderVerifierCalls === 1) {
                        markOlderVerifierStarted();
                        await olderGate;
                    }
                },
            },
        },
    });
    const newerClient = createPrivacyClient({
        client: fixture.client,
        deployment: fixture.deployment,
        stateStore: fixture.store,
        services: {
            indexer: {
                async syncPool(input) {
                    assert.equal(input.previousSnapshot, undefined);
                    return { snapshot: newerSnapshot, noteUpdates: noteUpdate(newerRoot) };
                },
            },
            stateVerifier: { async verifyPoolSync() {} },
        },
    });

    const staleResult = assert.rejects(
        olderClient.sync({ poolId: fixture.pool.id }),
        error => error instanceof StaleStateError && error.details?.retryable === true,
    );
    await olderVerifierStarted;
    await newerClient.sync({ poolId: fixture.pool.id });
    assert.equal((await fixture.store.getPoolSnapshot(fixture.pool.id)).state.sequence, 2n);
    assert.equal((await fixture.store.getNote('note-1')).acceptedRoot, newerRoot);

    releaseOlder();
    await staleResult;
    assert.equal((await fixture.store.getPoolSnapshot(fixture.pool.id)).state.sequence, 2n);
    assert.equal((await fixture.store.getNote('note-1')).acceptedRoot, newerRoot);

    await olderClient.sync({ poolId: fixture.pool.id });
    assert.equal((await fixture.store.getPoolSnapshot(fixture.pool.id)).state.sequence, 3n);
    assert.equal((await fixture.store.getNote('note-1')).acceptedRoot, retryRoot);
});

test('signer adapter accepts only the operation client and canonical chain hashes', async () => {
    const client = { sendTransaction() {}, getCellLive() {} };
    const mismatched = { client: {}, async sendTransaction() { return h32('1'); } };
    await assert.rejects(
        signAndSendWithCcc({ client, signer: mismatched, transaction: {} }),
        SignerMismatchError,
    );
    const synthetic = { client, async sendTransaction() { return '0xsubmitted_fake'; } };
    await assert.rejects(signAndSendWithCcc({ client, signer: synthetic, transaction: {} }));
});

test('note encryption boundary authenticates public envelope metadata', async () => {
    const note = {
        version: 1,
        id: 'encrypted-note',
        poolId: h32('a'),
        commitment: f(77),
        secret: f(78),
        nullifierSecret: f(79),
        state: 'created',
        createdAt: 10,
    };
    const cipher = {
        async encrypt(plaintext) {
            return { algorithm: 'test-only', nonce: Uint8Array.of(1), ciphertext: plaintext };
        },
        async decrypt(payload) {
            return payload.ciphertext;
        },
    };
    const envelope = await sealOwnedNote(note, cipher);
    assert.deepEqual(await openOwnedNote(envelope, cipher), note);
    await assert.rejects(openOwnedNote({ ...envelope, noteId: 'mutated' }, cipher), InvariantViolationError);
});

test('private note storage rejects a contract-invalid zero commitment', async () => {
    const store = new InMemoryPrivacyStateStore();
    await assert.rejects(store.putNote({
        version: 1,
        id: 'zero-commitment',
        poolId: h32('a'),
        commitment: f(0),
        secret: f(2),
        nullifierSecret: f(3),
        state: 'created',
        createdAt: 1,
    }), /note\.commitment must not be zero/);
    assert.equal(await store.getNote('zero-commitment'), undefined);
});

test('note and operation state machines reject skipped lifecycle states', () => {
    const created = {
        version: 1,
        id: 'note',
        poolId: h32('a'),
        commitment: f(1),
        secret: f(2),
        nullifierSecret: f(3),
        state: 'created',
        createdAt: 1,
    };
    assert.throws(() => transitionNote(created, 'spent'), InvariantViolationError);
    assert.throws(() => transitionNote({ ...created, state: 'corrupted' }, 'staged'));
    const operation = {
        id: 'op',
        kind: 'shield',
        poolId: h32('a'),
        state: 'queued',
        createdAt: 1,
        updatedAt: 1,
    };
    assert.throws(() => transitionOperation(operation, 'committed', { updatedAt: 2 }), InvariantViolationError);
});

test('legacy submission paths fail instead of fabricating transaction hashes', async () => {
    const provider = new MemoryWithdrawalProvider({});
    await assert.rejects(provider.submitWithdrawal({}), UnsupportedOperationError);
    await assert.rejects(withdrawMix({
        sessionId: 'legacy',
        inputOutPoint: `${h32('1')}:0x0`,
        blindingFactor: h32('2'),
        secret: h32('3'),
        nullifierSecret: h32('4'),
        stealthOutputAddress: 'ckt1-placeholder',
        createdAt: 1,
    }), UnsupportedOperationError);
});

test('published root is V1-only while the legacy subpath remains available', async () => {
    const publicSdk = await import('mixer-sdk');
    const legacySdk = await import('mixer-sdk/legacy');
    assert.equal(typeof publicSdk.createPrivacyClient, 'function');
    assert.equal('MixerClient' in publicSdk, false);
    assert.equal('withdrawMix' in publicSdk, false);
    assert.equal(typeof legacySdk.MixerClient, 'function');
    assert.equal(typeof legacySdk.withdrawMix, 'function');
});
