import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import type { SportDatabase } from '@/shared/database/contract';
import { getProgressVaultSettings, insertProgressPhoto, listProgressPhotos, markProgressVaultConfigured, prepareProgressVaultSetup, deleteProgressPhotoMetadata, removeAllProgressPhotoMetadata, resetProgressVaultMetadata } from '../data/progressPhotoRepository';
import { validatePhotoDate, type ProgressPhoto } from '../domain/vaultModels';
import { expoVaultCrypto, type VaultCrypto } from './vaultCrypto';
import { privateVaultFiles, type VaultFiles } from './vaultFiles';
import { protectVaultPath } from './fileProtection';
import { commitEncryptedPhoto, deleteEncryptedPhoto, deleteEncryptedPhotoCollection, exportPhotoExplicitly, findOrphanedVaultFileIds, readAndRemovePhotoInputs } from './vaultMaintenance';
import { getConfiguredVaultKey, getPendingVaultKey } from './vaultKeyAccess';

const KEY_PREFIX = 'sport.progress.vault.key.';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
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
  const chunks: string[] = [];
  const bytesPerChunk = 3 * 8192;
  for (let offset = 0; offset < bytes.length; offset += bytesPerChunk) {
    const end = Math.min(bytes.length, offset + bytesPerChunk);
    let encoded = '';
    for (let index = offset; index < end; index += 3) {
      const first = bytes[index]!;
      const hasSecond = index + 1 < end;
      const hasThird = index + 2 < end;
      const second = hasSecond ? bytes[index + 1]! : 0;
      const third = hasThird ? bytes[index + 2]! : 0;
      encoded += BASE64_ALPHABET[first >> 2];
      encoded += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
      encoded += hasSecond ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)] : '=';
      encoded += hasThird ? BASE64_ALPHABET[third & 0x3f] : '=';
    }
    chunks.push(encoded);
  }
  return chunks.join('');
}

async function removeTemporaryUri(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export class ProgressVaultService {
  constructor(
    private readonly dependencies: ProgressVaultDependencies = productionDependencies,
  ) {}

  async setupOrUnlock(db: SportDatabase): Promise<{ keyId: string; key: string }> {
    const settings = await getProgressVaultSettings(db);
    if (settings.setupState === 'unconfigured' || settings.setupState === 'pending') {
      const keyId = await prepareProgressVaultSetup(db, this.dependencies.idFactory);
      // This read is the explicit biometric gate before displaying any private content.
      const authenticatedKey = await getPendingVaultKey(keyId, {
        read: (id) => this.dependencies.keyStore.get(id),
        write: (id, key) => this.dependencies.keyStore.set(id, key),
        generate: () => this.dependencies.crypto.generateKey(),
      });
      await markProgressVaultConfigured(db, keyId);
      return { keyId, key: authenticatedKey };
    }
    if (!settings.keyId) throw new Error('La configuration du coffre est invalide.');
    const key = await getConfiguredVaultKey(settings.keyId, (id) => this.dependencies.keyStore.get(id));
    return { keyId: settings.keyId, key };
  }

  async importPhoto(db: SportDatabase, key: string, request: ImportedPhoto): Promise<ProgressPhoto> {
    validatePhotoDate(request.date);
    if (!/^image\/[a-zA-Z0-9.+-]+$/.test(request.mimeType)) throw new Error('Le fichier sélectionné ne semble pas être une image valide.');
    const id = request.id;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Identifiant de photo invalide.');
    const originalFileId = this.dependencies.idFactory();
    const thumbnailFileId = this.dependencies.idFactory();
    const inputs = await readAndRemovePhotoInputs(request.sourceUri, request.thumbnailUri, {
      protect: protectVaultPath,
      read: async (uri) => new File(uri).bytes(),
      remove: removeTemporaryUri,
    });
    let encryptedOriginal: Uint8Array;
    let encryptedThumbnail: Uint8Array;
    try {
      encryptedOriginal = await this.dependencies.crypto.encrypt(inputs.original, key, getAad(id, request.date, 'original'));
      encryptedThumbnail = await this.dependencies.crypto.encrypt(inputs.thumbnail, key, getAad(id, request.date, 'thumbnail'));
    } finally {
      inputs.original.fill(0);
      inputs.thumbnail.fill(0);
    }
    const photo: ProgressPhoto = {
      id,
      date: request.date,
      encryptedFileId: originalFileId,
      encryptedThumbnailId: thumbnailFileId,
      mimeType: request.mimeType,
      createdAt: this.dependencies.now(),
    };
    await commitEncryptedPhoto({ photo, encryptedOriginal, encryptedThumbnail }, {
      write: (fileId, bytes) => this.dependencies.files.write(fileId, bytes),
      delete: (fileId) => this.dependencies.files.delete(fileId),
      insert: (value) => insertProgressPhoto(db, value),
    });
    return photo;
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
    try {
      return { photo, uri: `data:${thumbnail ? 'image/jpeg' : photo.mimeType};base64,${toBase64(bytes)}` };
    } finally {
      bytes.fill(0);
    }
  }

  async deletePhoto(db: SportDatabase, photo: ProgressPhoto): Promise<void> {
    await deleteEncryptedPhoto(
      photo,
      (id) => deleteProgressPhotoMetadata(db, id),
      (id) => this.dependencies.files.delete(id),
    );
  }

  async exportPhoto(photo: ProgressPhoto, key: string, destinationUri: string): Promise<void> {
    const bytes = await this.decryptPhoto(photo, key);
    const temporaryFile = new File(destinationUri);
    temporaryFile.create({ intermediates: true, overwrite: true });
    try {
      await exportPhotoExplicitly(bytes, {
        write: async (value) => { temporaryFile.write(value); },
        protect: () => protectVaultPath(temporaryFile.uri),
        saveToPhotos: async () => { await Asset.create(temporaryFile.uri); },
        remove: async () => { if (temporaryFile.exists) temporaryFile.delete(); },
      });
    } finally {
      bytes.fill(0);
    }
  }

  async deleteAllPhotos(db: SportDatabase): Promise<void> {
    await deleteEncryptedPhotoCollection(
      () => removeAllProgressPhotoMetadata(db),
      () => this.dependencies.files.deleteAll(),
    );
  }

  async reconcileFiles(db: SportDatabase): Promise<void> {
    const existing = await this.dependencies.files.listIds();
    await Promise.all(findOrphanedVaultFileIds(await listProgressPhotos(db), existing).map((id) => this.dependencies.files.delete(id)));
  }

  async resetInaccessibleVault(db: SportDatabase): Promise<void> {
    const settings = await getProgressVaultSettings(db);
    await resetProgressVaultMetadata(db);
    await this.dependencies.files.deleteAll();
    if (settings.keyId) await this.dependencies.keyStore.delete(settings.keyId).catch(() => undefined);
  }
}

export const progressVaultService = new ProgressVaultService();
