import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { groth16 } from "snarkjs";

const [wasmPath, provingKeyPath, verificationKeyPath] = process.argv.slice(2);
if (!wasmPath || !provingKeyPath || !verificationKeyPath) {
  console.error(
    "Usage: node measure-groth16.mjs <circuit.wasm> <benchmark.zkey> <verification-key.json>",
  );
  process.exit(2);
}

const vectorUrl = new URL("../test-vectors/withdrawal.json", import.meta.url);
const vector = JSON.parse(await readFile(vectorUrl, "utf8"));
const input = { ...vector.publicSignals, ...vector.privateWitness };
const verificationKey = JSON.parse(await readFile(verificationKeyPath, "utf8"));

const before = process.resourceUsage();
const proveStart = performance.now();
const { proof, publicSignals } = await groth16.fullProve(
  input,
  wasmPath,
  provingKeyPath,
);
const proveMilliseconds = performance.now() - proveStart;

const verifyStart = performance.now();
const verified = await groth16.verify(verificationKey, publicSignals, proof);
const verifyMilliseconds = performance.now() - verifyStart;
const after = process.resourceUsage();

const result = {
  schema: "obscell-v1-groth16-local-benchmark-v1",
  warning: "Disposable local setup only; this is not a production ceremony or CKB-VM measurement.",
  verified,
  proveMilliseconds: Number(proveMilliseconds.toFixed(2)),
  verifyMilliseconds: Number(verifyMilliseconds.toFixed(2)),
  maxRssKiB: after.maxRSS,
  userCpuMilliseconds: Number(
    ((after.userCPUTime - before.userCPUTime) / 1000).toFixed(2),
  ),
  systemCpuMilliseconds: Number(
    ((after.systemCPUTime - before.systemCPUTime) / 1000).toFixed(2),
  ),
  publicSignalCount: publicSignals.length,
  proofJsonBytes: Buffer.byteLength(JSON.stringify(proof)),
  arkworksUncompressedAbiBytes: 256,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
};

console.log(JSON.stringify(result, null, 2));
if (!verified) process.exitCode = 1;
