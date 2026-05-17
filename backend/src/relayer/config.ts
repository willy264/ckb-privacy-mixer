/**
 * Relayer configuration — loaded from environment variables.
 *
 * To run your own relayer, copy .env.example → .env and fill in:
 *   RELAYER_PRIVATE_KEY   — the CKB private key that pays gas fees
 *   CKB_RPC_URL           — e.g. https://testnet.ckbapp.dev/rpc
 *   CKB_INDEXER_URL       — e.g. https://testnet.ckbapp.dev/indexer
 *   RELAYER_FEE_RATE      — e.g. 0.01 (= 1 % of the denomination)
 */

export interface RelayerConfig {
    /** Private key (hex, no 0x prefix) of the relayer wallet that pays gas. */
    privateKey: string;
    /** CKB mainnet / testnet RPC endpoint. */
    ckbRpcUrl: string;
    /** CKB Lumos indexer endpoint. */
    ckbIndexerUrl: string;
    /**
     * Fraction of the denomination taken as relayer fee.
     * 0.01 = 1 %. This is deducted from the withdrawal amount on-chain.
     */
    feeRate: number;
    /** Minimum CKB tx fee in shannons. Defaults to 1000. */
    minFeeShannnons: bigint;
}

export function loadRelayerConfig(): RelayerConfig {
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) throw new Error('RELAYER_PRIVATE_KEY is required');

    const ckbRpcUrl = process.env.CKB_RPC_URL;
    if (!ckbRpcUrl) throw new Error('CKB_RPC_URL is required');

    const ckbIndexerUrl = process.env.CKB_INDEXER_URL;
    if (!ckbIndexerUrl) throw new Error('CKB_INDEXER_URL is required');

    const feeRate = parseFloat(process.env.RELAYER_FEE_RATE ?? '0.01');
    if (isNaN(feeRate) || feeRate < 0 || feeRate > 0.1) {
        throw new Error('RELAYER_FEE_RATE must be a number between 0 and 0.10');
    }

    return {
        privateKey,
        ckbRpcUrl,
        ckbIndexerUrl,
        feeRate,
        minFeeShannnons: BigInt(process.env.RELAYER_MIN_FEE_SHANNONS ?? '1000'),
    };
}
