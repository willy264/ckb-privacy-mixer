export type WithdrawalMode = 'live';
export type DepositNoteStatus = 'pending' | 'finalized';
export type VaultWithdrawalStatus = 'idle' | 'proof-ready' | 'submitted';
export const ENCRYPTED_NOTE_VERSION = 'obscell-encrypted-note-v1';

export interface DepositNote {
  version?: 2;
  status?: DepositNoteStatus;
  sessionId: string;
  participantId?: string;
  walletAddress?: string;
  inputOutPoint?: string;
  blindingFactor?: string;
  secret: string;
  nullifierSecret: string;
  stealthOutputAddress?: string;
  createdAt: number;
  commitment: string;
  sessionCommitments?: string[];
  nullifier?: string;
  leafIndex?: number;
  merkleRoot?: string;
  merkleProof?: any;
  proofEncoding?: 'groth16-bn254-arkworks-uncompressed-v1';
  depositTxHash?: string;
  runtimeMode?: 'disabled' | 'live';
  registrySnapshot?: {
    outPoint?: string;
    size?: number;
    authority?: 'direct' | 'operator-registry-lock' | 'self-custodied' | 'coordinator';
  };
  denomination: number;
  withdrawalStatus?: VaultWithdrawalStatus;
  lastPreparedAt?: number;
  lastPreparedMode?: WithdrawalMode;
  lastBroadcastAt?: number;
  lastBroadcastHash?: string;
}

export interface EncryptedDepositNote {
  version: typeof ENCRYPTED_NOTE_VERSION;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: number;
}

const NOTE_KDF_ITERATIONS = 600_000;

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid encrypted note encoding');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function deriveNoteKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function migrateNote(note: any): DepositNote {
  const version = note.version === 2 ? 2 : 2;
  return {
    version,
    status: note.status ?? (note.inputOutPoint ? 'finalized' : 'pending'),
    sessionId: note.sessionId,
    participantId: note.participantId,
    walletAddress: note.walletAddress,
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
    secret: note.secret || '0x0000000000000000000000000000000000000000000000000000000000000000',
    nullifierSecret: note.nullifierSecret || '0x0000000000000000000000000000000000000000000000000000000000000000',
    nullifier: note.nullifier,
    leafIndex: typeof note.leafIndex === 'number' ? note.leafIndex : undefined,
    merkleRoot: note.merkleRoot,
    merkleProof: note.merkleProof,
    proofEncoding: note.proofEncoding ?? 'groth16-bn254-arkworks-uncompressed-v1',
    depositTxHash: note.depositTxHash,
    runtimeMode: note.runtimeMode ?? 'disabled',
    registrySnapshot: note.registrySnapshot,
    denomination: Number(note.denomination ?? 100),
    withdrawalStatus: note.withdrawalStatus ?? 'idle',
    lastPreparedAt: note.lastPreparedAt,
    lastPreparedMode: note.lastPreparedMode,
    lastBroadcastAt: note.lastBroadcastAt,
    lastBroadcastHash: note.lastBroadcastHash,
  };
}

export function getNoteId(note: Pick<DepositNote, 'sessionId' | 'inputOutPoint' | 'createdAt'>) {
  return `${note.sessionId}:${note.inputOutPoint}:${note.createdAt}`;
}

export function parseNoteBackup(jsonString: string): DepositNote {
  const parsed = JSON.parse(jsonString);
  if (!parsed || !parsed.sessionId || !parsed.commitment || !parsed.secret || !parsed.nullifierSecret) {
    throw new Error('Invalid note backup format');
  }

  return migrateNote(parsed);
}

export function exportNoteBackup(note: DepositNote): string {
  const { withdrawalStatus, lastPreparedAt, lastPreparedMode, ...backupData } = note;
  return JSON.stringify(backupData, null, 2);
}

export async function encryptNoteBackup(note: DepositNote, password: string): Promise<string> {
  if (!password) {
    throw new Error('A note password is required.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveNoteKey(password, salt, NOTE_KDF_ITERATIONS);
  const plaintext = new TextEncoder().encode(exportNoteBackup(note));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const encrypted: EncryptedDepositNote = {
    version: ENCRYPTED_NOTE_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: NOTE_KDF_ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: bufToHex(salt),
    iv: bufToHex(iv),
    ciphertext: bufToHex(new Uint8Array(ciphertext)),
    createdAt: Date.now(),
  };

  return JSON.stringify(encrypted, null, 2);
}

export async function decryptNoteBackup(jsonString: string, password: string): Promise<DepositNote> {
  if (!password) {
    throw new Error('A note password is required.');
  }

  const parsed = JSON.parse(jsonString) as Partial<EncryptedDepositNote>;
  if (
    parsed.version !== ENCRYPTED_NOTE_VERSION ||
    parsed.kdf !== 'PBKDF2-SHA256' ||
    parsed.cipher !== 'AES-256-GCM' ||
    typeof parsed.iterations !== 'number' ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.ciphertext !== 'string'
  ) {
    throw new Error('Invalid encrypted note format');
  }

  const salt = hexToBuf(parsed.salt);
  const iv = hexToBuf(parsed.iv);
  const ciphertext = hexToBuf(parsed.ciphertext);
  const key = await deriveNoteKey(password, salt, parsed.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
    return parseNoteBackup(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Unable to decrypt note. Check the password and encrypted note text.');
  }
}

export function isEncryptedNoteBackup(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString) as Partial<EncryptedDepositNote>;
    return parsed.version === ENCRYPTED_NOTE_VERSION;
  } catch {
    return false;
  }
}
