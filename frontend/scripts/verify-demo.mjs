import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { preview } from "vite";
import { ccc } from "@ckb-ccc/core";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDirectory = process.env.DEMO_SCREENSHOT_DIR ?? os.tmpdir();
const testRecipient = ccc.Address.from({
  prefix: "ckt",
  script: {
    codeHash: `0x${"00".repeat(32)}`,
    hashType: "type",
    args: `0x${"11".repeat(20)}`,
  },
}).toString();

async function launchBrowser() {
  const requestedChannel = process.env.PLAYWRIGHT_CHANNEL;
  const attempts = requestedChannel
    ? [{ channel: requestedChannel }]
    : [{}, { channel: "chrome" }, { channel: "msedge" }];
  const failures = [];
  for (const options of attempts) {
    try {
      return await chromium.launch({ ...options, headless: true });
    } catch (error) {
      failures.push(error);
    }
  }
  throw new AggregateError(
    failures,
    "No Chromium browser is available. Run `pnpm exec playwright install chromium` or set PLAYWRIGHT_CHANNEL.",
  );
}

async function closePreviewServer(server) {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.httpServer.closeAllConnections?.();
  });
}

let previewServer;
let baseUrl = process.env.DEMO_BASE_URL;
if (!baseUrl) {
  assert.ok(
    fs.existsSync(path.join(frontendRoot, "dist", "index.html")),
    "Production build missing. Run `pnpm build` before the browser verifier.",
  );
  previewServer = await preview({
    root: frontendRoot,
    logLevel: "error",
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const address = previewServer.httpServer.address();
  assert.ok(address && typeof address !== "string", "Vite preview did not expose a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

const errors = [];
const privacyNetworkRequests = [];
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let recordPrivacyNetwork = false;
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("request", (request) => {
    if (
      recordPrivacyNetwork &&
      (request.resourceType() === "fetch" || request.resourceType() === "xhr")
    ) {
      privacyNetworkRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Opt into privacy. Keep CCC." }).waitFor();
  assert.match(await page.locator("body").innerText(), /privacy operations are protocol simulations/i);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `Desktop page overflows horizontally by ${overflow}px`);

  await page.getByRole("button", { name: "Enable privacy" }).click();
  await page.getByText(/Obscell capability enabled for this CCC application/).waitFor();

  recordPrivacyNetwork = true;
  await page.getByRole("button", { name: "Shield assets" }).click();
  await page.getByRole("dialog", { name: "Shield assets" }).waitFor();
  await page.getByRole("button", { name: "Run shield simulation" }).click();
  await page.getByText(/Shield simulation complete/).waitFor({ timeout: 10_000 });

  const balanceValues = page.locator(".demo-balance-item > strong");
  assert.match(await balanceValues.nth(0).innerText(), /^0\s+CT$/);
  assert.match(await balanceValues.nth(1).innerText(), /^100\s+CT$/);

  await page.getByRole("button", { name: "Payment App" }).click();
  await page.getByRole("heading", { name: "CKB Payment App" }).waitFor();
  assert.match(await balanceValues.nth(1).innerText(), /^100\s+CT$/);

  await page.getByRole("button", { name: "Send privately" }).click();
  await page.getByLabel("Recipient CKB address").fill("not-a-ckb-address");
  await page.getByRole("button", { name: "Prepare payment concept" }).click();
  await page.getByText(/Enter a valid CKB address/).waitFor();
  await page.getByLabel("Recipient CKB address").fill(testRecipient);
  await page.getByRole("button", { name: "Prepare payment concept" }).click();
  await page.getByText(/Payment concept prepared to the signing boundary/).waitFor({ timeout: 10_000 });
  assert.match(await balanceValues.nth(0).innerText(), /^0\s+CT$/);
  assert.match(await balanceValues.nth(1).innerText(), /^100\s+CT$/);

  await page.getByRole("button", { name: "Public" }).click();
  await page.getByText(/Public mode restored/).waitFor();
  await page.getByRole("button", { name: "Private" }).click();
  await page.getByText(/Obscell capability enabled for this CCC application/).waitFor();
  assert.match(await balanceValues.nth(1).innerText(), /^100\s+CT$/);

  await page.getByRole("tab", { name: "Protocol View" }).click();
  await page.getByRole("heading", { name: "Target protocol V1" }).waitFor();
  const protocolText = await page.locator(".demo-protocol-view").innerText();
  assert.match(protocolText, /not live chain state/i);
  assert.match(protocolText, /0x\*{8}/);
  assert.match(protocolText, /generated/i);
  assert.match(protocolText, /bound/i);
  await page.screenshot({
    path: path.join(screenshotDirectory, "obscell-demo-verified-protocol.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Developer View" }).click();
  await page.getByRole("heading", { name: /Add privacy to an application already using CCC/ }).waitFor();
  assert.match(await page.locator(".demo-developer-view").innerText(), /Prototype API/);
  assert.match(await page.locator(".demo-code-content").innerText(), /createPrivacyClient/);
  await page.screenshot({
    path: path.join(screenshotDirectory, "obscell-demo-verified-developer.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Application view" }).click();
  await page.getByRole("button", { name: "Unshield" }).click();
  await page.getByRole("button", { name: "Run unshield simulation" }).click();
  await page.getByText(/Unshield simulation complete/).waitFor({ timeout: 10_000 });
  assert.match(await balanceValues.nth(0).innerText(), /^100\s+CT$/);
  assert.match(await balanceValues.nth(1).innerText(), /^0\s+CT$/);

  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByText(/Demo scenario reset/).waitFor();
  assert.match(await balanceValues.nth(0).innerText(), /^100\s+CT$/);
  assert.match(await balanceValues.nth(1).innerText(), /^--\s+CT$/);

  const bodyText = await page.locator("body").innerText();
  assert.doesNotMatch(bodyText, /\b0x[0-9a-f]{16,}\b/i);
  assert.doesNotMatch(bodyText, /100% anonymous|fully private|maximum privacy/i);
  assert.deepEqual(privacyNetworkRequests, [], "Simulated privacy actions made network requests");
  assert.deepEqual(errors, [], "The demo emitted browser errors");

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const presentationOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(presentationOverflow <= 1, `Presentation page overflows by ${presentationOverflow}px`);
  await page.screenshot({
    path: path.join(screenshotDirectory, "obscell-demo-verified-presentation.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: path.join(screenshotDirectory, "obscell-demo-verified-desktop.png"),
    fullPage: true,
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const mobileOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(mobileOverflow <= 1, `Mobile page overflows horizontally by ${mobileOverflow}px`);
  await mobile.getByRole("button", { name: "Enable privacy" }).click();
  await mobile.getByText(/Obscell capability enabled for this CCC application/).waitFor();
  await mobile.getByRole("button", { name: "Shield assets" }).click();
  const mobileDialog = mobile.getByRole("dialog", { name: "Shield assets" });
  const dialogBox = await mobileDialog.boundingBox();
  assert.ok(dialogBox && dialogBox.x >= 0 && dialogBox.width <= 390, "Mobile dialog is out of bounds");
  await mobile.getByRole("button", { name: "Close dialog" }).click();
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({
    path: path.join(screenshotDirectory, "obscell-demo-verified-mobile.png"),
    fullPage: true,
  });

  const legacy = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await legacy.goto(`${baseUrl}/?view=legacy`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await legacy.getByText(/SpectraMix/i).first().waitFor({ timeout: 20_000 });
  const legacyText = await legacy.locator("body").innerText();
  assert.match(legacyText, /Legacy mixer prototype/);
  assert.doesNotMatch(
    legacyText,
    /Maximum \(Relay\)|withdrawal is anonymous|Latest deposits|Anonymity set/i,
  );

  const legacyHonestySource = [
    "src/components/StatsSidebar.tsx",
    "src/components/WithdrawTab.tsx",
    "src/hooks/useWithdrawalFlow.ts",
  ]
    .map(relativePath => fs.readFileSync(path.join(frontendRoot, relativePath), "utf8"))
    .join("\n");
  assert.doesNotMatch(legacyHonestySource, /Math\.random|Maximum \(Relay\)|is anonymous/i);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        interactions: [
          "privacy opt-in",
          "shield",
          "shared payment-app state",
          "CCC recipient validation",
          "payment preview",
          "mode persistence",
          "developer view",
          "protocol view",
          "unshield",
          "reset",
          "legacy route",
          "legacy honesty boundary",
        ],
        networkRequestsDuringPrivacyOperations: privacyNetworkRequests.length,
        screenshots: [
          path.join(screenshotDirectory, "obscell-demo-verified-desktop.png"),
          path.join(screenshotDirectory, "obscell-demo-verified-presentation.png"),
          path.join(screenshotDirectory, "obscell-demo-verified-mobile.png"),
          path.join(screenshotDirectory, "obscell-demo-verified-developer.png"),
          path.join(screenshotDirectory, "obscell-demo-verified-protocol.png"),
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await closePreviewServer(previewServer);
}
