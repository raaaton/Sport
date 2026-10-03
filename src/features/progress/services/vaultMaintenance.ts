import type { ProgressPhoto } from '../domain/vaultModels';

export function findOrphanedVaultFileIds(photos: readonly ProgressPhoto[], storedIds: readonly string[]): string[] {
  const referenced = new Set(photos.flatMap((photo) => [photo.encryptedFileId, photo.encryptedThumbnailId]));
  return storedIds.filter((id) => !referenced.has(id));
}

export async function deleteEncryptedPhoto(
  photo: ProgressPhoto,
  removeMetadata: (id: string) => Promise<void>,
  removeFile: (id: string) => Promise<void>,
): Promise<void> {
  await removeMetadata(photo.id);
  await Promise.all([
    removeFile(photo.encryptedFileId),
    removeFile(photo.encryptedThumbnailId),
  ]);
}

export async function deleteEncryptedPhotoCollection(
  removeMetadata: () => Promise<void>,
  removeFiles: () => Promise<void>,
): Promise<void> {
  await removeMetadata();
  await removeFiles();
}

export type EncryptedPhotoWrite = {
  photo: ProgressPhoto;
  encryptedOriginal: Uint8Array;
  encryptedThumbnail: Uint8Array;
};

export type EncryptedPhotoWritePort = {
  write(id: string, bytes: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
  insert(photo: ProgressPhoto): Promise<void>;
};

/** Keeps SQLite metadata behind both ciphertext writes, and rolls files back if commit fails. */
export async function commitEncryptedPhoto(input: EncryptedPhotoWrite, port: EncryptedPhotoWritePort): Promise<void> {
  let originalWritten = false;
  let thumbnailWritten = false;
  try {
    await port.write(input.photo.encryptedFileId, input.encryptedOriginal);
    originalWritten = true;
    await port.write(input.photo.encryptedThumbnailId, input.encryptedThumbnail);
    thumbnailWritten = true;
    await port.insert(input.photo);
  } catch (error) {
    if (originalWritten) await port.delete(input.photo.encryptedFileId).catch(() => undefined);
    if (thumbnailWritten) await port.delete(input.photo.encryptedThumbnailId).catch(() => undefined);
    throw error;
  }
}

export type PhotoInputPort = {
  protect(uri: string): Promise<void>;
  read(uri: string): Promise<Uint8Array>;
  remove(uri: string): Promise<void>;
};

/** Protects picker/manipulator cache outputs, reads them, then removes plaintext before encryption starts. */
export async function readAndRemovePhotoInputs(sourceUri: string, thumbnailUri: string, port: PhotoInputPort): Promise<{ original: Uint8Array; thumbnail: Uint8Array }> {
  try {
    await port.protect(sourceUri);
    await port.protect(thumbnailUri);
    const original = await port.read(sourceUri);
    const thumbnail = await port.read(thumbnailUri);
    return { original, thumbnail };
  } finally {
    const cleanupResults = await Promise.allSettled([port.remove(sourceUri), port.remove(thumbnailUri)]);
    const cleanupFailure = cleanupResults.find((result) => result.status === 'rejected');
    if (cleanupFailure?.status === 'rejected') throw cleanupFailure.reason;
  }
}

export type ExplicitPhotoExportPort = {
  write(bytes: Uint8Array): Promise<void>;
  protect(): Promise<void>;
  saveToPhotos(): Promise<void>;
  remove(): Promise<void>;
};

/** Called only from the user's confirmed export action; plaintext remains in a protected temp file briefly. */
export async function exportPhotoExplicitly(bytes: Uint8Array, port: ExplicitPhotoExportPort): Promise<void> {
  try {
    await port.protect();
    await port.write(bytes);
    await port.saveToPhotos();
  } finally {
    await port.remove();
  }
}
