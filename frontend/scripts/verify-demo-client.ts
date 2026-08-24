import assert from "node:assert/strict";

import { ccc } from "@ckb-ccc/core";

import { createDemoPrivacyClient } from "../src/demo/client/DemoPrivacyClient";
import { DEFAULT_DEMO_POOL_ID } from "../src/demo/types";

const recipient = ccc.Address.from({
  prefix: "ckt",
  script: {
    codeHash: `0x${"00".repeat(32)}`,
    hashType: "type",
    args: `0x${"11".repeat(20)}`,
  },
}).toString();

const client = createDemoPrivacyClient({ transitionDelayMs: 0 });
let emissions = 0;
const unsubscribe = client.subscribe(() => {
  emissions += 1;
});

const shield = await client.shield({
  poolId: DEFAULT_DEMO_POOL_ID,
  consumer: "reference-wallet",
});
const shielded = client.getSnapshot();
const noteId = shielded.notes[0]?.id;
assert.ok(noteId, "Shield must produce a demo note");
assert.deepEqual([shielded.publicBalance, shielded.privateBalance], [0n, 100n]);
assert.equal("txHash" in shield || "blockNumber" in shield || "confirmedAt" in shield, false);

const payment = await client.unshield({
  poolId: DEFAULT_DEMO_POOL_ID,
  consumer: "payment-app",
  noteId,
  recipient,
  purpose: "recipient-payment",
});
const afterPayment = client.getSnapshot();
assert.equal(payment.status, "ready-for-signing");
assert.deepEqual([afterPayment.publicBalance, afterPayment.privateBalance], [0n, 100n]);

await client.unshield({
  poolId: DEFAULT_DEMO_POOL_ID,
  consumer: "reference-wallet",
  noteId,
  recipient,
  purpose: "return-public",
});
const afterUnshield = client.getSnapshot();
assert.deepEqual([afterUnshield.publicBalance, afterUnshield.privateBalance], [100n, 0n]);

await assert.rejects(
  client.unshield({
    poolId: DEFAULT_DEMO_POOL_ID,
    consumer: "reference-wallet",
    noteId,
    recipient,
    purpose: "return-public",
  }),
  /already been consumed/,
);

unsubscribe();
assert.ok(emissions > 3, "Privacy client subscriptions must emit state changes");

console.log("DemoPrivacyClient invariants passed.");
