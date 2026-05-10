import type { DepositNote as MixerDepositNote } from 'mixer-sdk';

export type WithdrawalMode = 'aggron-preview' | 'local-preview';
export type VaultWithdrawalStatus = 'idle' | 'proof-ready' | 'submitted';

export interface DepositNote extends MixerDepositNote {
  denomination: number;
  withdrawalStatus?: VaultWithdrawalStatus;
  lastPreparedAt?: number;
  lastPreparedMode?: WithdrawalMode;
  lastBroadcastAt?: number;
  lastBroadcastHash?: string;
}

const VAULT_KEY = 'obscell_mixer_vault';
const VAULT_SALT_KEY = 'obscell_mixer_vault_salt';
const VAULT_IV_KEY = 'obscell_mixer_vault_iv';

// --- Encryption helpers ---
// Vault data is encrypted with AES-256-GCM using a key derived from a user-provided
// password via PBKDF2. The salt and IV are stored separately in localStorage.
// If no password has been set, the vault falls back to unencrypted storage for
// backward compatibility, but logs a warning.

let cachedPassword: string | null = null;

/**
 * Set the vault encryption password for this session.
 * Must be called before any vault read/write operations for encrypted storage.
 */
export function setVaultPassword(password: string) {
  cachedPassword = password;
}

/** Check whether the vault has encrypted data stored. */
export function isVaultEncrypted(): boolean {
  return !!localStorage.getItem(VAULT_SALT_KEY);
}

/** Clear the cached password from memory. */
export function lockVault() {
  cachedPassword = null;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password) as any,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptData(plaintext: string, password: string): Promise<{ cipher: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16) as any) as Uint8Array;
  const iv = crypto.getRandomValues(new Uint8Array(12) as any) as Uint8Array;
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    enc.encode(plaintext) as any,
  );
  return {
    cipher: bufToHex(new Uint8Array(cipherBuf as ArrayBuffer)),
    salt: bufToHex(salt),
    iv: bufToHex(iv),
  };
}

async function decryptData(cipherHex: string, saltHex: string, ivHex: string, password: string): Promise<string> {
  const salt = hexToBuf(saltHex);
  const iv = hexToBuf(ivHex);
  const cipher = hexToBuf(cipherHex);
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    cipher as any,
  );
  return new TextDecoder().decode(plainBuf as ArrayBuffer);
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// --- Migration ---

function migrateNote(note: any): DepositNote {
  const version = note.version === 2 ? 2 : 2;
  return {
    version,
    sessionId: note.sessionId,
    inputOutPoint: note.inputOutPoint,
    blindingFactor: note.blindingFactor,
    stealthOutputAddress: note.stealthOutputAddress,
    createdAt: note.createdAt ?? Date.now(),
    commitment: note.commitment,
    sessionCommitments: Array.isArray(note.sessionCommitments)
      ? note.sessionCommitments
      : note.commitment
        ? [note.commitment]
        : undefined,
    nullifier: note.nullifier,
    leafIndex: typeof note.leafIndex === 'number' ? note.leafIndex : undefined,
    merkleRoot: note.merkleRoot,
    merkleProof: note.merkleProof,
    proofEncoding: note.proofEncoding ?? 'groth16-bn254-arkworks-uncompressed-v1',
    depositTxHash: note.depositTxHash,
    runtimeMode: note.runtimeMode ?? 'preview',
    registrySnapshot: note.registrySnapshot,
    denomination: Number(note.denomination ?? 100),
    withdrawalStatus: note.withdrawalStatus ?? 'idle',
    lastPreparedAt: note.lastPreparedAt,
    lastPreparedMode: note.lastPreparedMode,
    lastBroadcastAt: note.lastBroadcastAt,
    lastBroadcastHash: note.lastBroadcastHash,
  };
}

// --- Public API ---

export function getNoteId(note: Pick<DepositNote, 'sessionId' | 'inputOutPoint' | 'createdAt'>) {
  return `${note.sessionId}:${note.inputOutPoint}:${note.createdAt}`;
}

async function writeVault(notes: DepositNote[]) {
  const json = JSON.stringify(notes);

  if (cachedPassword) {
    const { cipher, salt, iv } = await encryptData(json, cachedPassword);
    localStorage.setItem(VAULT_KEY, cipher);
    localStorage.setItem(VAULT_SALT_KEY, salt);
    localStorage.setItem(VAULT_IV_KEY, iv);
  } else {
    // Fallback: unencrypted (backward compat, logged as warning)
    console.warn('[vault] No password set — vault data is stored unencrypted. Call setVaultPassword() to encrypt.');
    localStorage.setItem(VAULT_KEY, json);
  }
}

async function readVault(): Promise<DepositNote[]> {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];

    const saltHex = localStorage.getItem(VAULT_SALT_KEY);

    if (saltHex) {
      // Encrypted vault
      if (!cachedPassword) {
        console.warn('[vault] Vault is encrypted but no password is set. Call setVaultPassword() first.');
        return [];
      }
      const ivHex = localStorage.getItem(VAULT_IV_KEY)!;
      const json = await decryptData(raw, saltHex, ivHex, cachedPassword);
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(migrateNote);
    }

    // Unencrypted vault (legacy)
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateNote);
  } catch (error) {
    console.error('Failed to read vault notes', error);
    return [];
  }
}

// Synchronous versions for backward compat (used in render paths)
// These read from a cached snapshot that is refreshed by the async loaders.
let cachedNotes: DepositNote[] = [];

export function getNotesFromVault(): DepositNote[] {
  // Synchronous path: read from cache. Callers should call refreshVault() on init.
  return cachedNotes;
}

/** Async vault refresh — must be called on app init and after mutations. */
export async function refreshVault(): Promise<DepositNote[]> {
  cachedNotes = await readVault();
  return cachedNotes;
}

export async function saveNoteToVault(note: DepositNote) {
  const existing = await readVault();
  existing.push(migrateNote(note));
  await writeVault(existing);
  cachedNotes = existing;
}

export async function updateNoteInVault(updatedNote: DepositNote) {
  const existing = await readVault();
  const noteId = getNoteId(updatedNote);
  const index = existing.findIndex(note => getNoteId(note) === noteId);

  if (index >= 0) {
    existing[index] = migrateNote(updatedNote);
  } else {
    existing.push(migrateNote(updatedNote));
  }

  await writeVault(existing);
  cachedNotes = existing;
}

export async function clearVault() {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(VAULT_SALT_KEY);
  localStorage.removeItem(VAULT_IV_KEY);
  cachedNotes = [];
}
