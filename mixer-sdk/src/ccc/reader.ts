import type { Cell, Client, OutPointLike } from '@ckb-ccc/core';
import { StateUnavailableError } from '../core/errors.js';

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Operation aborted.', 'AbortError');
    }
}

export class CccPrivacyReader {
    constructor(readonly client: Client) {}

    async getLiveCell(
        outPoint: OutPointLike,
        options: {
            readonly withData?: boolean;
            readonly includeTxPool?: boolean;
            readonly signal?: AbortSignal;
        } = {},
    ): Promise<Cell | undefined> {
        throwIfAborted(options.signal);
        const cell = await this.client.getCellLive(
            outPoint,
            options.withData ?? true,
            options.includeTxPool ?? false,
        );
        throwIfAborted(options.signal);
        return cell;
    }

    async requireLiveCell(
        outPoint: OutPointLike,
        options: {
            readonly withData?: boolean;
            readonly includeTxPool?: boolean;
            readonly signal?: AbortSignal;
        } = {},
    ): Promise<Cell> {
        const cell = await this.getLiveCell(outPoint, options);
        if (!cell) {
            throw new StateUnavailableError('Required authoritative CKB cell is not live.');
        }
        return cell;
    }
}
