export type ProgressVaultSetupState = 'unconfigured' | 'pending' | 'configured';
export type VaultAutoLockMinutes = 0 | 1 | 5;

export type ProgressVaultSettings = {
  setupState: ProgressVaultSetupState;
  keyId: string | null;
  autoLockMinutes: VaultAutoLockMinutes;
};

export type ProgressPhoto = {
  id: string;
  date: string;
  encryptedFileId: string;
  encryptedThumbnailId: string;
  mimeType: string;
  createdAt: string;
};

export type VaultErrorKind = 'biometric_cancelled' | 'biometric_unavailable' | 'key_unavailable' | 'storage_failure';
export type VaultSessionState =
  | { kind: 'unconfigured' }
  | { kind: 'locked' }
  | { kind: 'unlocking' }
  | { kind: 'unlocked'; sessionId: number }
  | { kind: 'locking' }
  | { kind: 'error'; error: VaultErrorKind };

export type VaultSessionAction =
  | { type: 'begin_setup_or_unlock' }
  | { type: 'unlock_succeeded'; sessionId: number }
  | { type: 'begin_lock' }
  | { type: 'lock_finished' }
  | { type: 'failed'; error: VaultErrorKind }
  | { type: 'reset' };

export function transitionVaultSession(state: VaultSessionState, action: VaultSessionAction): VaultSessionState {
  switch (action.type) {
    case 'begin_setup_or_unlock':
      return state.kind === 'unlocked' || state.kind === 'unlocking' ? state : { kind: 'unlocking' };
    case 'unlock_succeeded':
      return state.kind === 'unlocking' ? { kind: 'unlocked', sessionId: action.sessionId } : state;
    case 'begin_lock':
      return state.kind === 'unconfigured' || state.kind === 'locked' ? state : { kind: 'locking' };
    case 'lock_finished':
      return state.kind === 'locking' ? { kind: 'locked' } : state;
    case 'failed':
      return { kind: 'error', error: action.error };
    case 'reset':
      return { kind: 'unconfigured' };
  }
}

export function validatePhotoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Choisissez une date valide.');
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.toISOString().slice(0, 10) !== value) throw new Error('Choisissez une date valide.');
  return value;
}

export function validateAutoLockMinutes(value: number): VaultAutoLockMinutes {
  if (value !== 0 && value !== 1 && value !== 5) throw new Error('Choisissez un délai de verrouillage valide.');
  return value;
}

export function autoLockDeadline(backgroundAt: number, minutes: VaultAutoLockMinutes): number {
  return backgroundAt + minutes * 60_000;
}

export function hasAutoLockExpired(deadline: number, now: number): boolean {
  return now >= deadline;
}
