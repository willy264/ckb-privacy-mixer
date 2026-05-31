import { ccc } from '@ckb-ccc/core';
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
    private address: string;
    private readonly client: ccc.ClientPublicTestnet;
    private readonly signer: ccc.SignerCkbPrivateKey;

    constructor(cfg: RelayerConfig) {
        this.privateKey = `0x${cfg.privateKey}`;
        this.client = new ccc.ClientPublicTestnet({
            url: cfg.ckbRpcUrl,
        });
        this.signer = new ccc.SignerCkbPrivateKey(this.client, this.privateKey);
        this.address = 'pending';
        void this.signer.getRecommendedAddress().then(address => {
            this.address = address;
            logger.info(`[RelayerWallet] Initialized. Address: ${address}`);
        });

    }

    getAddress(): string {
        return this.address;
    }

    getPrivateKey(): string {
        return this.privateKey;
    }

    getClient(): ccc.ClientPublicTestnet {
        return this.client;
    }

    getSigner(): ccc.SignerCkbPrivateKey {
        return this.signer;
    }

    /** Returns the relayer's CKB balance in shannons. */
    async getBalanceShannnons(): Promise<bigint> {
        let total = 0n;
        for await (const cell of this.signer.findCells({})) {
            total += BigInt(cell.cellOutput.capacity.toString());
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
