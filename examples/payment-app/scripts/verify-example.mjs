import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { preview } from 'vite';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(applicationRoot, '../..');
const explicitOutputPath = process.argv[2];
const outputPath = path.resolve(
    applicationRoot,
    explicitOutputPath ?? path.join(os.tmpdir(), 'obscell-payment-example.png'),
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

async function launchBrowser() {
    const failures = [];
    for (const options of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
        try {
            return {
                browser: await chromium.launch({ ...options, headless: true }),
                channel: options.channel ?? 'playwright-bundled',
            };
        } catch (error) {
            failures.push(error);
        }
    }
    throw new AggregateError(failures, 'No Chromium browser is available for the payment example.');
}

const server = await preview({
    root: applicationRoot,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const address = server.httpServer.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const errors = [];
const dataRequests = [];
let browser;

try {
    const launched = await launchBrowser();
    browser = launched.browser;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    page.on('request', request => {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
            dataRequests.push(`${request.method()} ${request.url()}`);
        }
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText('Fixture verified', { exact: true }).waitFor({ timeout: 30_000 });
    assert.match(await page.locator('body').innerText(), /No live payment is being made/i);
    assert.equal(await page.locator('#private-balance').innerText(), '100 CT');
    const transactionSubmissions = Number(await page.locator('#submission-count').innerText());
    assert.equal(transactionSubmissions, 0);
    assert.equal(await page.locator('#verifier-count').innerText(), '1');
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        0,
    );
    assert.deepEqual(dataRequests, []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: outputPath, fullPage: true });

    let metadataPath;
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on('request', request => {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
            dataRequests.push(`${request.method()} ${request.url()}`);
        }
    });
    await mobile.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await mobile.getByText('Fixture verified', { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(
        await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        0,
    );
    assert.deepEqual(dataRequests, []);

    if (explicitOutputPath) {
        metadataPath = path.join(
            path.dirname(outputPath),
            `${path.basename(outputPath, path.extname(outputPath))}.json`,
        );
        const screenshotBytes = fs.readFileSync(outputPath);
        const git = args => execFileSync('git', args, {
            cwd: repositoryRoot,
            encoding: 'utf8',
            windowsHide: true,
        }).trim();
        const metadata = {
            schema: 'obscell-second-consumer-evidence-v1',
            capturedAtUtc: new Date().toISOString(),
            command: 'pnpm --filter obscell-payment-example capture:evidence',
            evidenceMode: 'deterministic-local-fixture',
            liveChain: false,
            gitCommit: git(['rev-parse', 'HEAD']),
            workingTree: git(['status', '--porcelain']) ? 'dirty' : 'clean',
            browser: { channel: launched.channel, version: browser.version() },
            dataRequests: dataRequests.length,
            transactionSubmissions,
            screenshot: {
                name: path.basename(outputPath),
                bytes: screenshotBytes.byteLength,
                sha256: createHash('sha256').update(screenshotBytes).digest('hex'),
            },
        };
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    }

    console.log(JSON.stringify({
        status: 'passed',
        browser: { channel: launched.channel, version: browser.version() },
        execution: 'deterministic-local-fixture',
        liveChain: false,
        dataRequests: dataRequests.length,
        transactionSubmissions,
        screenshot: outputPath,
        metadata: metadataPath,
    }, null, 2));
} catch (error) {
    if (errors.length > 0) {
        console.error(errors.join('\n'));
    }
    throw error;
} finally {
    await browser?.close();
    await new Promise((resolve, reject) => {
        server.httpServer.close(error => error ? reject(error) : resolve());
        server.httpServer.closeAllConnections?.();
    });
}
