import * as crypto from 'crypto';

/**
 * Generates a mock one-time stealth address in the format used by Obscell.
 * In production this performs ECDH against the recipient's stealth meta-address.
 *
 * Stealth address derivation (simplified):
 *   r = random scalar
 *   R = r * G  (ephemeral public key, published on-chain)
 *   P' = P + H(r * Q) * G  (one-time address, where Q is recipient viewing key)
 *
 * @param recipientMetaAddress  the recipient's published stealth meta-address
 * @returns a one-time CKB-format stealth address string
 */
export function generateStealthAddress(recipientMetaAddress: string): string {
    const r = crypto.randomBytes(8).toString('hex');
    return `ckt1_stealth_${r}_${recipientMetaAddress.substring(0, 12)}`;
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
