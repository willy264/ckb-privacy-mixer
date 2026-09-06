import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeterministicPaymentFixture } from '../src/fixture.js';

test('independent payment consumer uses public PrivacyClient boundaries without a chain claim', async () => {
    const fixture = await createDeterministicPaymentFixture();

    assert.equal(fixture.execution, 'deterministic-local-fixture');
    assert.equal(fixture.liveChain, false);
    assert.deepEqual(fixture.diagnostics, {
        fixtureGenesisReads: 0,
        indexerSyncs: 0,
        verifierChecks: 0,
        cellReads: 0,
        transactionSubmissions: 0,
    });

    const view = await fixture.model.refresh(fixture.poolId);

    assert.deepEqual(view, {
        protocolVersion: 'obscell-v1',
        sync: 'verified-by-injected-adapter',
        poolId: fixture.poolId,
        assetId: view.assetId,
        denomination: 100n,
        privateAmount: 100n,
        spendableNotes: 1,
        stateSequence: 1n,
        liveOperationsAvailable: false,
        stateProtection: 'memory-only',
    });
    assert.match(view.assetId, /^0x[0-9a-f]{64}$/);
    assert.deepEqual(fixture.diagnostics, {
        fixtureGenesisReads: 1,
        indexerSyncs: 1,
        verifierChecks: 1,
        cellReads: 0,
        transactionSubmissions: 0,
    });
    assert.equal((await fixture.stateStore.getNote('fixture-payment-note'))?.state, 'accepted');
});
