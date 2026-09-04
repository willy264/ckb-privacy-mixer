import './style.css';
import { createDeterministicPaymentFixture } from './fixture.js';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
    throw new Error('Application root is missing.');
}

app.innerHTML = `
  <header class="app-header">
    <div class="brand-block">
      <span class="brand-mark" aria-hidden="true">LP</span>
      <div>
        <strong>Lattice Pay</strong>
        <span>CKB merchant checkout</span>
      </div>
    </div>
    <span class="environment">Local integration fixture</span>
  </header>
  <main>
    <section class="request" aria-labelledby="request-heading">
      <p class="eyebrow">Payment request</p>
      <h1 id="request-heading">Invoice OB-1042</h1>
      <p class="merchant">Northstar Compute Cooperative</p>
      <dl class="request-details">
        <div><dt>Amount</dt><dd>100 CT</dd></div>
        <div><dt>Network</dt><dd>Fixture only</dd></div>
        <div><dt>Settlement</dt><dd>Unavailable</dd></div>
      </dl>
      <div class="notice">
        <strong>No live payment is being made.</strong>
        <span>This screen exercises SDK boundaries with deterministic local data.</span>
      </div>
    </section>
    <section class="privacy-panel" aria-labelledby="privacy-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Obscell capability</p>
          <h2 id="privacy-heading">Private payment balance</h2>
        </div>
        <span class="status" id="sync-status">Checking</span>
      </div>
      <div class="balance-row">
        <span>Available privately</span>
        <strong id="private-balance">--</strong>
      </div>
      <dl class="sdk-details">
        <div><dt>Protocol</dt><dd id="protocol">--</dd></div>
        <div><dt>Spendable notes</dt><dd id="note-count">--</dd></div>
        <div><dt>Pool state</dt><dd id="state-sequence">--</dd></div>
        <div><dt>Private storage</dt><dd id="state-protection">--</dd></div>
      </dl>
      <div class="pipeline" aria-label="SDK integration path">
        <span>CCC client</span><span>Indexer observation</span><span>State verifier</span><span>PrivacyClient</span>
      </div>
      <div class="diagnostics">
        <span><strong id="submission-count">0</strong> transactions submitted</span>
        <span><strong id="verifier-count">0</strong> verifier checks</span>
      </div>
      <button id="refresh" type="button">Refresh fixture</button>
      <p class="scope-note">Shield, proof generation, signing, and settlement remain unavailable in this V1 foundation.</p>
    </section>
  </main>
  <footer>
    Independent consumer of the public <code>mixer-sdk</code> package entry point
  </footer>
`;

function setText(id: string, value: string): void {
    const element = document.querySelector<HTMLElement>(`#${id}`);
    if (!element) {
        throw new Error(`Missing view element: ${id}`);
    }
    element.textContent = value;
}

async function refresh(): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>('#refresh');
    const status = document.querySelector<HTMLElement>('#sync-status');
    if (!button || !status) {
        throw new Error('Fixture controls are missing.');
    }
    button.disabled = true;
    status.textContent = 'Checking';
    status.dataset.state = 'pending';
    try {
        const fixture = await createDeterministicPaymentFixture();
        const view = await fixture.model.refresh(fixture.poolId);
        setText('private-balance', `${view.privateAmount.toString()} CT`);
        setText('protocol', view.protocolVersion);
        setText('note-count', view.spendableNotes.toString());
        setText('state-sequence', `Sequence ${view.stateSequence.toString()}`);
        setText('state-protection', view.stateProtection);
        setText('submission-count', fixture.diagnostics.transactionSubmissions.toString());
        setText('verifier-count', fixture.diagnostics.verifierChecks.toString());
        status.textContent = 'Fixture verified';
        status.dataset.state = 'ready';
    } catch (error) {
        status.textContent = 'Fixture failed';
        status.dataset.state = 'error';
        setText('private-balance', 'Unavailable');
        console.error(error);
    } finally {
        button.disabled = false;
    }
}

document.querySelector('#refresh')?.addEventListener('click', () => {
    void refresh();
});

void refresh();
