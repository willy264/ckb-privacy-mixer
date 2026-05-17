import { hd, helpers, RPC, Indexer, config as lumosConfig } from '@ckb-lumos/lumos';
import type { RelayerConfig } from './config.js';
import { logger } from '../utils/logger.js';

/**
 * RelayerWallet
 *
 * Wraps the relayer's funded CKB private key.
 * This key ONLY pays network transaction fees.
 * It cannot redirect withdrawal outputs — those are enforced by the on-chain ZK proof.
 */
export class RelayerWallet {
    private readonly privateKey: string;
    private readonly address: string;
    private readonly rpc: RPC;
    private readonly indexer: Indexer;

    constructor(cfg: RelayerConfig) {
        // Derive the relayer's CKB address from the private key
        lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
        const pubKey     = hd.key.privateToPublic(`0x${cfg.privateKey}`);
        const pubKeyHash = hd.key.publicKeyToBlake160(pubKey);
        this.address = helpers.encodeToAddress(
            {
                codeHash: lumosConfig.predefined.AGGRON4.SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                hashType: 'type',
                args: pubKeyHash,
            },
            { config: lumosConfig.predefined.AGGRON4 },
        );
        this.privateKey = `0x${cfg.privateKey}`;
        this.rpc = new RPC(cfg.ckbRpcUrl);
        this.indexer = new Indexer(cfg.ckbIndexerUrl, cfg.ckbRpcUrl);

        logger.info(`[RelayerWallet] Initialized. Address: ${this.address}`);
    }

    getAddress(): string {
        return this.address;
    }

    getPrivateKey(): string {
        return this.privateKey;
    }

    getRpc(): RPC {
        return this.rpc;
    }

    getIndexer(): Indexer {
        return this.indexer;
    }

    /** Returns the relayer's CKB balance in shannons. */
    async getBalanceShannnons(): Promise<bigint> {
        const cells = await this.indexer.getCells({
            script: helpers.parseAddress(this.address),
            scriptType: 'lock',
        });

        let total = 0n;
        for await (const cell of cells.objects) {
            total += BigInt(cell.cellOutput.capacity);
        }
        return total;
    }

    /** Warn if the relayer wallet is running low on funds. */
    async checkBalance(): Promise<void> {
        const balance = await this.getBalanceShannnons();
        const ckb = Number(balance) / 1e8;
        if (ckb < 10) {
            logger.warn(`[RelayerWallet] LOW BALANCE: ${ckb.toFixed(4)} CKB — top up soon!`);
        } else {
            logger.info(`[RelayerWallet] Balance: ${ckb.toFixed(4)} CKB`);
        }
    }
}
