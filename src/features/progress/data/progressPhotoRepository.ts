import type { SportDatabase } from '@/shared/database/contract';
import { validateAutoLockMinutes, validatePhotoDate, type ProgressPhoto, type ProgressVaultSettings, type VaultAutoLockMinutes } from '../domain/vaultModels.ts';

type VaultSettingsRow = {
  setup_state: ProgressVaultSettings['setupState'];
  key_id: string | null;
  auto_lock_minutes: number;
};

type ProgressPhotoRow = {
  id: string;
  photo_date: string;
  encrypted_file_id: string;
  encrypted_thumbnail_id: string;
  mime_type: string;
  created_at: string;
};

function toVaultSettings(row: VaultSettingsRow): ProgressVaultSettings {
  return {
    setupState: row.setup_state,
    keyId: row.key_id,
    autoLockMinutes: validateAutoLockMinutes(row.auto_lock_minutes),
  };
}

function toProgressPhoto(row: ProgressPhotoRow): ProgressPhoto {
  return {
    id: row.id,
    date: row.photo_date,
    encryptedFileId: row.encrypted_file_id,
    encryptedThumbnailId: row.encrypted_thumbnail_id,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export async function getProgressVaultSettings(db: SportDatabase): Promise<ProgressVaultSettings> {
  const row = await db.getFirstAsync<VaultSettingsRow>(
    'SELECT setup_state,key_id,auto_lock_minutes FROM progress_vault_settings WHERE id=1',
  );
  if (!row) throw new Error('Les réglages du coffre ne sont pas initialisés.');
  return toVaultSettings(row);
}

/** Reuses a pending key identifier after a cancelled first Face ID prompt. */
export async function prepareProgressVaultSetup(db: SportDatabase, idFactory: () => string): Promise<string> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<VaultSettingsRow>(
      'SELECT setup_state,key_id,auto_lock_minutes FROM progress_vault_settings WHERE id=1',
    );
    if (!row) throw new Error('Les réglages du coffre ne sont pas initialisés.');
    if (row.setup_state === 'configured' && row.key_id) throw new Error('Le coffre est déjà configuré.');
    if (row.setup_state === 'pending' && row.key_id) return row.key_id;

    const keyId = idFactory();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(keyId)) throw new Error('Identifiant de coffre invalide.');
    await tx.runAsync("UPDATE progress_vault_settings SET setup_state='pending',key_id=? WHERE id=1", keyId);
    return keyId;
  });
}

export async function markProgressVaultConfigured(db: SportDatabase, keyId: string): Promise<void> {
  const result = await db.runAsync(
    "UPDATE progress_vault_settings SET setup_state='configured' WHERE id=1 AND setup_state='pending' AND key_id=?",
    keyId,
  );
  if (result.changes !== 1) throw new Error('La configuration du coffre a changé. Réessayez.');
}

export async function updateProgressVaultAutoLock(db: SportDatabase, value: number): Promise<VaultAutoLockMinutes> {
  const minutes = validateAutoLockMinutes(value);
  await db.runAsync('UPDATE progress_vault_settings SET auto_lock_minutes=? WHERE id=1', minutes);
  return minutes;
}

/** Resets metadata only after the service has explicitly removed ciphertext and key material. */
export async function resetProgressVaultMetadata(db: SportDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM progress_photos');
    await tx.runAsync("UPDATE progress_vault_settings SET setup_state='unconfigured',key_id=NULL WHERE id=1");
  });
}

export async function getProgressPhoto(db: SportDatabase, id: string): Promise<ProgressPhoto | null> {
  const row = await db.getFirstAsync<ProgressPhotoRow>(
    'SELECT id,photo_date,encrypted_file_id,encrypted_thumbnail_id,mime_type,created_at FROM progress_photos WHERE id=?',
    id,
  );
  return row ? toProgressPhoto(row) : null;
}

export async function listProgressPhotos(db: SportDatabase): Promise<ProgressPhoto[]> {
  const rows = await db.getAllAsync<ProgressPhotoRow>(
    'SELECT id,photo_date,encrypted_file_id,encrypted_thumbnail_id,mime_type,created_at FROM progress_photos ORDER BY photo_date DESC,created_at DESC,id DESC',
  );
  return rows.map(toProgressPhoto);
}

export async function insertProgressPhoto(db: SportDatabase, photo: ProgressPhoto): Promise<void> {
  validatePhotoDate(photo.date);
  if (!photo.id || !photo.encryptedFileId || !photo.encryptedThumbnailId || !/^image\/[a-zA-Z0-9.+-]+$/.test(photo.mimeType)) {
    throw new Error('Les informations de la photo sont invalides.');
  }
  await db.runAsync(
    'INSERT INTO progress_photos(id,photo_date,encrypted_file_id,encrypted_thumbnail_id,mime_type,created_at) VALUES (?,?,?,?,?,?)',
    photo.id, photo.date, photo.encryptedFileId, photo.encryptedThumbnailId, photo.mimeType, photo.createdAt,
  );
}

export async function deleteProgressPhotoMetadata(db: SportDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM progress_photos WHERE id=?', id);
  if (result.changes !== 1) throw new Error('Cette photo n’existe plus dans le coffre.');
}

export async function removeAllProgressPhotoMetadata(db: SportDatabase): Promise<void> {
  await db.runAsync('DELETE FROM progress_photos');
}
