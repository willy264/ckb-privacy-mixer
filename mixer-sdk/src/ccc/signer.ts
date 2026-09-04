import type { Client, Hex, Signer, TransactionLike } from '@ckb-ccc/core';
import { InvalidArgumentError, SignerMismatchError } from '../core/errors.js';
import { assertHex32 } from '../crypto/field.js';

export function assertOperationSigner(client: Client, signer: Signer): Signer {
    if (!signer || typeof signer !== 'object' || typeof signer.sendTransaction !== 'function') {
        throw new InvalidArgumentError('A CCC Signer is required for this operation.');
    }
    if (signer.client !== client) {
        throw new SignerMismatchError();
    }
    return signer;
}

export async function signAndSendWithCcc(input: {
    readonly client: Client;
    readonly signer: Signer;
    readonly transaction: TransactionLike;
}): Promise<Hex> {
    const signer = assertOperationSigner(input.client, input.signer);
    const transactionHash = await signer.sendTransaction(input.transaction);
    assertHex32(transactionHash, 'transaction hash');
    return transactionHash;
}
