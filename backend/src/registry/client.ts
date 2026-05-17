import { logger } from '../utils/logger.js';

/** Minimal JSON-RPC helper — avoids importing internals from mixer-sdk. */
async function callRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    });
    if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result as T;
}

/**
 * RelayerRegistryClient
 *
 * Reads the on-chain relayer registry cell to return a list of all
 * registered relayers. The frontend uses this list to show users a
 * choice of independent relayers, preserving decentralization.
 *
 * On-chain registry cell data format (future contract):
 *   [0..3]   u32 LE  — number of relayer entries
 *   per entry (64 bytes):
 *     [0..19]  20-byte CKB lock args (relayer address hash)
 *     [20..23] u32 LE fee rate * 10000 (e.g. 100 = 1.00%)
 *     [24..55] 32-byte reserved / metadata hash
 *     [56..63] u64 LE stake amount in shannons
 */

export interface RelayerEntry {
    address: string;
    feePercent: number;
    stakeShannons: bigint;
    /** HTTP endpoint announced by the relayer (stored in metadata). */
    endpoint: string;
}

export class RelayerRegistryClient {
    constructor(
        private readonly rpcUrl: string,
        private readonly registryOutPoint?: { txHash: string; index: string },
    ) {}

    /**
     * Fetch all registered relayers from the on-chain registry cell.
     * Falls back to a hardcoded list if the registry contract is not yet deployed.
     */
    async getRelayers(): Promise<RelayerEntry[]> {
        if (!this.registryOutPoint) {
            logger.warn('[Registry] No on-chain registry configured — returning default relayer');
            return this.defaultRelayers();
        }

        try {
            const tx = await callRpc<{ transaction: { outputsData: string[] } }>(
                this.rpcUrl,
                'get_transaction',
                [this.registryOutPoint.txHash],
            );

            const dataHex = tx?.transaction?.outputsData?.[
                Number(this.registryOutPoint.index)
            ];
            if (!dataHex) return this.defaultRelayers();

            return this.parseRegistryData(dataHex);
        } catch (err) {
            logger.error('[Registry] Failed to fetch relayer registry', { error: String(err) });
            return this.defaultRelayers();
        }
    }

    private parseRegistryData(dataHex: string): RelayerEntry[] {
        // Strip 0x prefix
        const hex = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
        if (hex.length < 8) return this.defaultRelayers();

        const count = parseInt(hex.slice(0, 8), 16); // u32 LE (already parsed as LE here)
        const entries: RelayerEntry[] = [];

        // Each entry is 64 bytes = 128 hex chars
        for (let i = 0; i < count; i++) {
            const offset = 8 + i * 128;
            if (offset + 128 > hex.length) break;

            const feeRaw    = parseInt(hex.slice(offset + 40, offset + 48), 16);
            const stakeHex  = hex.slice(offset + 112, offset + 128);

            entries.push({
                address:      `0x${hex.slice(offset, offset + 40)}`,
                feePercent:   feeRaw / 100,
                stakeShannons: BigInt(`0x${stakeHex}`),
                endpoint:     process.env.RELAYER_PUBLIC_URL ?? 'http://localhost:4000',
            });
        }

        return entries.length > 0 ? entries : this.defaultRelayers();
    }

    /** Default relayer list when the on-chain registry is not yet deployed. */
    private defaultRelayers(): RelayerEntry[] {
        return [{
            address:       process.env.RELAYER_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            feePercent:    parseFloat(process.env.RELAYER_FEE_RATE ?? '0.01') * 100,
            stakeShannons: 0n,
            endpoint:      process.env.RELAYER_PUBLIC_URL ?? 'http://localhost:4000',
        }];
    }
}
