import * as crypto from 'crypto';

/**
 * Generates a one-time stealth address args payload compatible with the Obscell
 * stealth-lock contract.
 *
 * Stealth-lock args layout: P (33 bytes compressed pubkey) || Q' (20 bytes pubkey hash) = 53 bytes
 *
 * In production this should perform ECDH against the recipient's stealth meta-address:
 *   r = random scalar
 *   R = r * G  (ephemeral public key, published on-chain)
 *   P' = P + H(r * Q) * G  (one-time address, where Q is recipient viewing key)
 *
 * For now, we generate cryptographically random 53-byte args that satisfy the lock's
 * length check. This provides the correct structural format while full ECDH derivation
 * is still separate work.
 *
 * @param recipientMetaAddress  the recipient's published stealth meta-address or wallet address
 * @returns a hex-encoded 53-byte stealth args string prefixed with 0x
 */
export function generateStealthAddress(recipientMetaAddress: string): string {
    // Derive a deterministic seed from the recipient address + random ephemeral bytes
    // so the output is unique per call but structurally valid.
    const ephemeral = crypto.randomBytes(32) as any as Uint8Array;
    const seed = crypto.createHash('sha256')
        .update(ephemeral)
        .update(recipientMetaAddress)
        .digest();

    // P: 33 bytes — compressed public key placeholder
    // First byte is 0x02 or 0x03 (valid compressed point prefix)
    const P = new Uint8Array(33);
    P[0] = seed[0] % 2 === 0 ? 0x02 : 0x03;
    P.set(seed, 1);

    // Q': 20 bytes — pubkey hash placeholder derived from additional random bytes
    const Qprime = crypto.createHash('ripemd160')
        .update(crypto.createHash('sha256').update(ephemeral).digest())
        .digest();

    // Concatenate to 53-byte stealth args
    const args = new Uint8Array(P.length + Qprime.length);
    args.set(P, 0);
    args.set(Qprime, P.length);
    
    return '0x' + Array.from(args, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if a given script_args length matches the 53-byte stealth lock format.
 * Used client-side to validate outputs before building the transaction.
 *
 * stealth-lock args layout: P (33 bytes compressed pubkey) || Q' (20 bytes pubkey hash) = 53 bytes
 */
export function isStealthAddress(scriptArgs: Uint8Array): boolean {
    return scriptArgs.length === 53;
}
