import { spawnSync } from "node:child_process";
import process from "node:process";

const [mode, ...unexpected] = process.argv.slice(2);
if (unexpected.length > 0 || (mode && mode !== "--build-only")) {
  console.error("Usage: node scripts/run-contract-tests.mjs [--build-only]");
  process.exit(2);
}

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const contractPackages = [
  "pool-state-type-v1",
  "vault-lock-v1",
  "staging-lock-v1",
  "mixer-pool-type",
  "nullifier-type",
  "registry-type",
  "zk-membership-type",
];
const rustFlags = [
  "-Zunstable-options",
  "-Cpanic=immediate-abort",
  "-Ctarget-feature=-a,-zaamo,-zalrsc",
].join(" ");

function run(args, env = process.env) {
  const result = spawnSync(cargo, args, {
    cwd: new URL("..", import.meta.url),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const buildArguments = [
  "build",
  "-Z",
  "build-std=core,alloc",
  "--locked",
  "--release",
  "--target",
  "riscv64imac-unknown-none-elf",
];
for (const packageName of contractPackages) {
  buildArguments.push("-p", packageName);
}
buildArguments.push("-j", "1");

run(buildArguments, { ...process.env, RUSTFLAGS: rustFlags });
if (mode !== "--build-only") {
  run([
    "test",
    "--locked",
    "-p",
    "obscell-v1-types",
    "-p",
    "tests",
    "-j",
    "1",
  ]);
}
