import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import type { SportDatabase } from '@/shared/database/contract';
import { getProgressVaultSettings, insertProgressPhoto, listProgressPhotos, markProgressVaultConfigured, prepareProgressVaultSetup, deleteProgressPhotoMetadata, removeAllProgressPhotoMetadata, resetProgressVaultMetadata } from '../data/progressPhotoRepository';
import { validatePhotoDate, type ProgressPhoto } from '../domain/vaultModels';
import { expoVaultCrypto, type VaultCrypto } from './vaultCrypto';
import { privateVaultFiles, type VaultFiles } from './vaultFiles';
import { protectVaultPath } from './fileProtection';

const KEY_PREFIX = 'sport.progress.vault.key.';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: 'Déverrouiller le coffre privé de Sport',
};

export type VaultKeyStore = {
  get(id: string): Promise<string | null>;
  set(id: string, key: string): Promise<void>;
  delete(id: string): Promise<void>;
};

export const biometricKeyStore: VaultKeyStore = {
  get: (id) => SecureStore.getItemAsync(`${KEY_PREFIX}${id}`, secureStoreOptions),
  set: async (id, key) => { await SecureStore.setItemAsync(`${KEY_PREFIX}${id}`, key, secureStoreOptions); },
  delete: async (id) => { await SecureStore.deleteItemAsync(`${KEY_PREFIX}${id}`, secureStoreOptions); },
};

export type ImportedPhoto = {
  id: string;
  date: string;
  sourceUri: string;
  mimeType: string;
  thumbnailUri: string;
};

export type PhotoPreview = {
  photo: ProgressPhoto;
  uri: string;
};

export type ProgressVaultDependencies = {
  keyStore: VaultKeyStore;
  files: VaultFiles;
  crypto: VaultCrypto;
  idFactory(): string;
  now(): string;
};

const productionDependencies: ProgressVaultDependencies = {
  keyStore: biometricKeyStore,
  files: privateVaultFiles,
  crypto: expoVaultCrypto,
  idFactory: () => Crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

function getAad(photoId: string, date: string, role: 'original' | 'thumbnail'): string {
  return `sport-progress-vault:v1:${photoId}:${date}:${role}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function removeTemporaryUri(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cleanup is best effort after the original content has been encrypted.
  }
}

export class ProgressVaultService {
  constructor(
    private readonly dependencies: ProgressVaultDependencies = productionDependencies,
  ) {}

  async setupOrUnlock(db: SportDatabase): Promise<{ keyId: string; key: string }> {
    const settings = await getProgressVaultSettings(db);
    if (settings.setupState === 'unconfigured' || settings.setupState === 'pending') {
      const keyId = await prepareProgressVaultSetup(db, this.dependencies.idFactory);
      let key = await this.dependencies.keyStore.get(keyId);
      if (!key) {
        key = await this.dependencies.crypto.generateKey();
        await this.dependencies.keyStore.set(keyId, key);
      }
      // This read is the explicit biometric gate before displaying any private content.
      const authenticatedKey = await this.dependencies.keyStore.get(keyId);
      if (!authenticatedKey) throw new Error('La clé du coffre est indisponible. Les fichiers chiffrés sont conservés.');
      await markProgressVaultConfigured(db, keyId);
      return { keyId, key: authenticatedKey };
    }
    if (!settings.keyId) throw new Error('La configuration du coffre est invalide.');
    const key = await this.dependencies.keyStore.get(settings.keyId);
    if (!key) throw new Error('La clé du coffre est inaccessible avec la biométrie actuelle. Les photos chiffrées sont conservées.');
    return { keyId: settings.keyId, key };
  }

  async importPhoto(db: SportDatabase, key: string, request: ImportedPhoto): Promise<ProgressPhoto> {
    validatePhotoDate(request.date);
    if (!/^image\/[a-zA-Z0-9.+-]+$/.test(request.mimeType)) throw new Error('Le fichier sélectionné ne semble pas être une image valide.');
    const id = request.id;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Identifiant de photo invalide.');
    const originalFileId = this.dependencies.idFactory();
    const thumbnailFileId = this.dependencies.idFactory();
    let originalWritten = false;
    let thumbnailWritten = false;
    try {
      await protectVaultPath(request.sourceUri);
      await protectVaultPath(request.thumbnailUri);
      const original = await new File(request.sourceUri).bytes();
      const thumbnail = await new File(request.thumbnailUri).bytes();
      const encryptedOriginal = await this.dependencies.crypto.encrypt(original, key, getAad(id, request.date, 'original'));
      const encryptedThumbnail = await this.dependencies.crypto.encrypt(thumbnail, key, getAad(id, request.date, 'thumbnail'));
      await this.dependencies.files.write(originalFileId, encryptedOriginal);
      originalWritten = true;
      await this.dependencies.files.write(thumbnailFileId, encryptedThumbnail);
      thumbnailWritten = true;
      await removeTemporaryUri(request.sourceUri);
      await removeTemporaryUri(request.thumbnailUri);
      const photo: ProgressPhoto = {
        id,
        date: request.date,
        encryptedFileId: originalFileId,
        encryptedThumbnailId: thumbnailFileId,
        mimeType: request.mimeType,
        createdAt: this.dependencies.now(),
      };
      await insertProgressPhoto(db, photo);
      return photo;
    } catch (error) {
      if (originalWritten) await this.dependencies.files.delete(originalFileId).catch(() => undefined);
      if (thumbnailWritten) await this.dependencies.files.delete(thumbnailFileId).catch(() => undefined);
      throw error;
    } finally {
      await removeTemporaryUri(request.sourceUri);
      await removeTemporaryUri(request.thumbnailUri);
    }
  }

  async listPhotos(db: SportDatabase): Promise<ProgressPhoto[]> {
    return listProgressPhotos(db);
  }

  async decryptPhoto(photo: ProgressPhoto, key: string, thumbnail = false): Promise<Uint8Array> {
    const fileId = thumbnail ? photo.encryptedThumbnailId : photo.encryptedFileId;
    const role = thumbnail ? 'thumbnail' : 'original';
    return this.dependencies.crypto.decrypt(await this.dependencies.files.read(fileId), key, getAad(photo.id, photo.date, role));
  }

  async previewPhoto(photo: ProgressPhoto, key: string, thumbnail = false): Promise<PhotoPreview> {
    const bytes = await this.decryptPhoto(photo, key, thumbnail);
    return { photo, uri: `data:${thumbnail ? 'image/jpeg' : photo.mimeType};base64,${toBase64(bytes)}` };
  }

  async deletePhoto(db: SportDatabase, photo: ProgressPhoto): Promise<void> {
    const encryptedOriginal = await this.dependencies.files.read(photo.encryptedFileId);
    const encryptedThumbnail = await this.dependencies.files.read(photo.encryptedThumbnailId);
    await this.dependencies.files.delete(photo.encryptedFileId);
    try {
      await this.dependencies.files.delete(photo.encryptedThumbnailId);
      await deleteProgressPhotoMetadata(db, photo.id);
    } catch (error) {
      await this.dependencies.files.write(photo.encryptedFileId, encryptedOriginal).catch(() => undefined);
      await this.dependencies.files.write(photo.encryptedThumbnailId, encryptedThumbnail).catch(() => undefined);
      throw error;
    }
  }

  async exportPhoto(photo: ProgressPhoto, key: string, destinationUri: string): Promise<void> {
    const bytes = await this.decryptPhoto(photo, key);
    const temporaryFile = new File(destinationUri);
    temporaryFile.create({ intermediates: true, overwrite: true });
    try {
      temporaryFile.write(bytes);
      await protectVaultPath(temporaryFile.uri);
      // Caller explicitly invokes the Photos save API only after the user confirms.
      const { saveToLibraryAsync } = await import('expo-media-library');
      await saveToLibraryAsync(temporaryFile.uri);
    } finally {
      if (temporaryFile.exists) temporaryFile.delete();
    }
  }

  async deleteAllPhotos(db: SportDatabase): Promise<void> {
    await this.dependencies.files.deleteAll();
    await removeAllProgressPhotoMetadata(db);
  }

  async resetInaccessibleVault(db: SportDatabase): Promise<void> {
    const settings = await getProgressVaultSettings(db);
    if (settings.keyId) await this.dependencies.keyStore.delete(settings.keyId).catch(() => undefined);
    await this.dependencies.files.deleteAll();
    await resetProgressVaultMetadata(db);
  }
}

export const progressVaultService = new ProgressVaultService();
