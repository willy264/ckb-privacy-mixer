import type { DepositNote as MixerDepositNote } from 'mixer-sdk';

export type WithdrawalMode = 'aggron-preview' | 'local-preview';
export type VaultWithdrawalStatus = 'idle' | 'proof-ready' | 'submitted';

export interface DepositNote extends MixerDepositNote {
  denomination: number;
  sessionCommitments?: string[];
  withdrawalStatus?: VaultWithdrawalStatus;
  lastPreparedAt?: number;
  lastPreparedMode?: WithdrawalMode;
  lastBroadcastAt?: number;
  lastBroadcastHash?: string;
}

const VAULT_KEY = 'obscell_mixer_vault';

export function getNoteId(note: Pick<DepositNote, 'sessionId' | 'inputOutPoint' | 'createdAt'>) {
  return `${note.sessionId}:${note.inputOutPoint}:${note.createdAt}`;
}

export function saveNoteToVault(note: DepositNote) {
  const existing = getNotesFromVault();
  existing.push(note);
  localStorage.setItem(VAULT_KEY, JSON.stringify(existing));
}

export function updateNoteInVault(updatedNote: DepositNote) {
  const existing = getNotesFromVault();
  const noteId = getNoteId(updatedNote);
  const index = existing.findIndex(note => getNoteId(note) === noteId);

  if (index >= 0) {
    existing[index] = updatedNote;
  } else {
    existing.push(updatedNote);
  }

  localStorage.setItem(VAULT_KEY, JSON.stringify(existing));
}

export function getNotesFromVault(): DepositNote[] {
  try {
    const data = localStorage.getItem(VAULT_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse vault notes', e);
    return [];
  }
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY);
}
