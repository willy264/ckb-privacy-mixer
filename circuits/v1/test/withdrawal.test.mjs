import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPoseidon } from "circomlibjs";
import { r1cs, wtns } from "snarkjs";

const require = createRequire(import.meta.url);

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const circuitsDirectory = path.resolve(testDirectory, "../..");
const circuitPath = path.resolve(testDirectory, "../withdrawal.circom");
const vectorPath = path.resolve(
  testDirectory,
  "../test-vectors/withdrawal.json",
);

const expectedPublicOrder = [
  "poolDomain",
  "assetDomain",
  "denomination",
  "value",
  "root",
  "nullifierHash",
  "recipientDomain",
  "actionHash",
  "authTag",
];

const requiredCircomVersion = "circom compiler 2.2.3";
const bn254ScalarModulus =
  "21888242871839275222246405745257275088548364400416034343698204186575808495617";

function assertCircomVersion() {
  const result = spawnSync("circom", ["--version"], {
    cwd: circuitsDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(
      `Unable to execute ${requiredCircomVersion}: ${result.error.message}`,
    );
  }
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    requiredCircomVersion,
    `Wrong Circom compiler; expected exactly ${requiredCircomVersion}`,
  );
}

function compileCircuit(outputDirectory) {
  const result = spawnSync(
    "circom",
    [
      circuitPath,
      "--r1cs",
      "--wasm",
      "--sym",
      "--inspect",
      "--prime",
      "bn128",
      "-l",
      path.join(circuitsDirectory, "node_modules"),
      "--output",
      outputDirectory,
    ],
    {
      cwd: circuitsDirectory,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.error) {
    throw new Error(
      `Unable to execute Circom 2.2.3: ${result.error.message}`,
    );
  }
  assert.equal(
    result.status,
    0,
    `Circom compilation failed:\n${result.stdout}${result.stderr}`,
  );
}

function incrementFieldElement(value) {
  return (BigInt(value) + 1n).toString();
}

function asciiTagLe(label) {
  return Buffer.from(label, "ascii").reduce(
    (tag, byte, index) => tag + (BigInt(byte) << (8n * BigInt(index))),
    0n,
  ).toString();
}

function fieldElementToLeHex(value) {
  return BigInt(value)
    .toString(16)
    .padStart(64, "0")
    .match(/../g)
    .reverse()
    .join("");
}

async function assertInvalidWitness(input, witnessCalculator, label) {
  await assert.rejects(
    () => witnessCalculator.calculateWitness(input, 1),
    undefined,
    `${label} unexpectedly satisfied the circuit`,
  );
}

const outputDirectory = await mkdtemp(
  path.join(tmpdir(), "obscell-withdrawal-v1-"),
);

try {
  assertCircomVersion();
  compileCircuit(outputDirectory);

  const vector = JSON.parse(await readFile(vectorPath, "utf8"));
  assert.equal(vector.protocolVersion, "obscell-v1");
  assert.equal(vector.merkleLevels, 20);
  assert.deepEqual(vector.publicSignalOrder, expectedPublicOrder);

  const domainTagLabels = {
    leaf: "obscell/v1/leaf",
    nullifier: "obscell/v1/nullifier",
    auth: "obscell/v1/auth",
    merkleEmpty: "obscell/v1/merkle-empty",
    merkleNode: "obscell/v1/merkle-node",
  };
  for (const [tagName, label] of Object.entries(domainTagLabels)) {
    assert.equal(vector.domainTags[tagName], asciiTagLe(label));
  }

  assert.deepEqual(
    vector.publicSignalsArray,
    expectedPublicOrder.map((signalName) => vector.publicSignals[signalName]),
  );
  assert.equal(
    vector.publicInputsLeHex,
    `0x${vector.publicSignalsArray.map(fieldElementToLeHex).join("")}`,
  );

  const symbolLines = (
    await readFile(path.join(outputDirectory, "withdrawal.sym"), "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const publicWireNames = new Map(
    symbolLines.map((line) => {
      const [, wireIndex, , signalName] = line.split(",");
      return [Number(wireIndex), signalName];
    }),
  );
  expectedPublicOrder.forEach((signalName, index) => {
    assert.equal(
      publicWireNames.get(index + 1),
      `main.${signalName}`,
      `public wire ${index + 1} changed`,
    );
  });

  const poseidon = await buildPoseidon();
  const hash = (inputs) =>
    poseidon.F.toString(poseidon(inputs.map((input) => BigInt(input))));

  const { domainTags, publicSignals, privateWitness, derived } = vector;
  const leaf = hash([
    domainTags.leaf,
    publicSignals.poolDomain,
    publicSignals.assetDomain,
    publicSignals.denomination,
    privateWitness.secret,
    privateWitness.nullifierSecret,
  ]);
  assert.equal(leaf, derived.leaf);

  let current = leaf;
  let leafIndex = 0n;
  for (let level = 0; level < vector.merkleLevels; level += 1) {
    const pathIndex = BigInt(privateWitness.pathIndices[level]);
    const sibling = privateWitness.pathElements[level];
    leafIndex += pathIndex * (1n << BigInt(level));
    const [left, right] =
      pathIndex === 0n ? [current, sibling] : [sibling, current];
    current = hash([
      domainTags.merkleNode,
      publicSignals.poolDomain,
      level,
      left,
      right,
    ]);
  }
  assert.equal(leafIndex.toString(), derived.leafIndex);
  assert.equal(current, publicSignals.root);
  assert.equal(
    hash([
      domainTags.nullifier,
      publicSignals.poolDomain,
      privateWitness.nullifierSecret,
      leafIndex,
    ]),
    publicSignals.nullifierHash,
  );
  assert.equal(
    hash([
      domainTags.auth,
      privateWitness.secret,
      publicSignals.recipientDomain,
      publicSignals.actionHash,
    ]),
    publicSignals.authTag,
  );
  assert.notEqual(
    hash([domainTags.merkleNode, publicSignals.poolDomain, 0, 11, 22]),
    hash([domainTags.merkleNode, publicSignals.poolDomain, 1, 11, 22]),
  );

  const validInput = { ...publicSignals, ...privateWitness };
  const r1csPath = path.join(outputDirectory, "withdrawal.r1cs");
  const wasmPath = path.join(
    outputDirectory,
    "withdrawal_js",
    "withdrawal.wasm",
  );
  const witnessCalculatorBuilder = require(
    path.join(
      outputDirectory,
      "withdrawal_js",
      "witness_calculator.js",
    ),
  );
  const witnessCalculator = await witnessCalculatorBuilder(
    await readFile(wasmPath),
  );
  const witnessPath = path.join(outputDirectory, "valid.wtns");
  await writeFile(
    witnessPath,
    await witnessCalculator.calculateWTNSBin(validInput, 1),
  );
  assert.equal(await wtns.check(r1csPath, witnessPath), true);

  const r1csMetadata = await r1cs.info(r1csPath);
  assert.equal(r1csMetadata.nPubInputs, 9);
  assert.equal(r1csMetadata.nPrvInputs, 42);
  assert.equal(r1csMetadata.nOutputs, 0);
  assert.equal(r1csMetadata.prime.toString(), bn254ScalarModulus);

  for (const signalName of expectedPublicOrder) {
    const invalidInput = {
      ...validInput,
      [signalName]: incrementFieldElement(validInput[signalName]),
    };
    await assertInvalidWitness(
      invalidInput,
      witnessCalculator,
      `wrong-${signalName}`,
    );
  }

  for (const [label, invalidInput] of [
    [
      "wrong-secret",
      { ...validInput, secret: incrementFieldElement(validInput.secret) },
    ],
    [
      "wrong-nullifier-secret",
      {
        ...validInput,
        nullifierSecret: incrementFieldElement(validInput.nullifierSecret),
      },
    ],
    [
      "wrong-path-element",
      {
        ...validInput,
        pathElements: validInput.pathElements.map((element, index) =>
          index === 7 ? incrementFieldElement(element) : element
        ),
      },
    ],
    [
      "wrong-valid-path-bit",
      {
        ...validInput,
        pathIndices: validInput.pathIndices.map((bit, index) =>
          index === 5 ? 1 - bit : bit
        ),
      },
    ],
  ]) {
    await assertInvalidWitness(invalidInput, witnessCalculator, label);
  }

  await assertInvalidWitness(
    {
      ...validInput,
      pathIndices: [
        2,
        ...validInput.pathIndices.slice(1),
      ],
    },
    witnessCalculator,
    "non-boolean-path-index",
  );

  let emptyRoot = hash([
    vector.domainTags.merkleEmpty,
    publicSignals.poolDomain,
  ]);
  assert.equal(emptyRoot, derived.emptyLeaf);
  for (let level = 0; level < vector.merkleLevels; level += 1) {
    emptyRoot = hash([
      vector.domainTags.merkleNode,
      publicSignals.poolDomain,
      level,
      emptyRoot,
      emptyRoot,
    ]);
  }
  assert.equal(emptyRoot, derived.emptyRoot);

  console.log(
    "withdrawal-v1: vector, public order, witness, and mutation checks passed",
  );
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}

// circomlibjs keeps a worker handle alive on some Node.js releases.
process.exit(0);
