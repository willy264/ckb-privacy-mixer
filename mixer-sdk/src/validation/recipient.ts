import { Address, Script, type Client, type ScriptLike } from '@ckb-ccc/core';
import { InvalidArgumentError } from '../core/errors.js';
import { deriveV1RecipientDomain } from '../crypto/script-domain.js';
import type { FieldHex } from '../crypto/field.js';

export type PrivacyRecipient = string | ScriptLike;

export async function resolveRecipientScript(
    client: Client,
    recipient: PrivacyRecipient,
): Promise<Script> {
    if (typeof recipient === 'string') {
        if (!recipient.trim()) {
            throw new InvalidArgumentError('Recipient address must not be empty.');
        }
        return (await Address.fromString(recipient, client)).script;
    }
    if (!recipient || typeof recipient !== 'object') {
        throw new InvalidArgumentError('Recipient must be a CKB address or CCC ScriptLike value.');
    }
    return Script.from(recipient);
}

export async function validateAndDeriveRecipientDomain(
    client: Client,
    recipient: PrivacyRecipient,
): Promise<{ readonly script: Script; readonly domain: FieldHex }> {
    const script = await resolveRecipientScript(client, recipient);
    return Object.freeze({ script, domain: await deriveV1RecipientDomain(script) });
}
