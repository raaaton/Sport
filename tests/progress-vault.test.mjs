import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  deleteProgressPhotoMetadata,
  getProgressVaultSettings,
  insertProgressPhoto,
  listProgressPhotos,
  markProgressVaultConfigured,
  prepareProgressVaultSetup,
  resetProgressVaultMetadata,
  updateProgressVaultAutoLock,
} from '../src/features/progress/data/progressPhotoRepository.ts';
import {
  autoLockDeadline,
  hasAutoLockExpired,
  transitionVaultSession,
  validateAutoLockMinutes,
  validatePhotoDate,
} from '../src/features/progress/domain/vaultModels.ts';
import { migrateAndSeed } from '../src/shared/database/schema.ts';
import { VAULT_GCM_NONCE_BYTES, VAULT_GCM_TAG_BYTES, frameEncryptedContent, unframeEncryptedContent, vaultAssociatedData } from '../src/features/progress/services/vaultCipherFormat.ts';
import { commitEncryptedPhoto, deleteEncryptedPhoto, deleteEncryptedPhotoCollection, exportPhotoExplicitly, findOrphanedVaultFileIds, readAndRemovePhotoInputs } from '../src/features/progress/services/vaultMaintenance.ts';
import { getConfiguredVaultKey, getPendingVaultKey } from '../src/features/progress/services/vaultKeyAccess.ts';

class NodeDatabase {
  constructor(database = new DatabaseSync(':memory:')) { this.database = database; }
  async execAsync(sql) { this.database.exec(sql); }
  async runAsync(sql, ...params) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync(sql, ...params) { return this.database.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.database.prepare(sql).all(...params); }
  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.database.exec('COMMIT'); return result; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}

async function setup() {
  const db = new NodeDatabase();
  await migrateAndSeed(db, () => '2026-10-03T10:00:00.000Z');
  let nextId = 0;
  return { db, id: () => `vault-${++nextId}` };
}

test('schema v7 creates a lazy unconfigured vault and is idempotent', async () => {
  const { db } = await setup();
  assert.equal((await getProgressVaultSettings(db)).setupState, 'unconfigured');
  await migrateAndSeed(db, () => '2026-10-03T11:00:00.000Z');
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM progress_vault_settings')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT MAX(version) AS version FROM schema_migrations')).version, 7);
});

test('vault setup stays pending until authenticated retrieval succeeds and keeps its key id on retry', async () => {
  const { db, id } = await setup();
  assert.equal(await prepareProgressVaultSetup(db, id), 'vault-1');
  assert.equal(await prepareProgressVaultSetup(db, id), 'vault-1');
  assert.equal((await getProgressVaultSettings(db)).setupState, 'pending');
  await markProgressVaultConfigured(db, 'vault-1');
  assert.deepEqual(await getProgressVaultSettings(db), { setupState: 'configured', keyId: 'vault-1', autoLockMinutes: 0 });
  await assert.rejects(prepareProgressVaultSetup(db, id), /déjà configuré/);
});

test('photo dates accept real ISO dates and multiple records on the same date', async () => {
  const { db } = await setup();
  assert.equal(validatePhotoDate('2026-02-28'), '2026-02-28');
  assert.throws(() => validatePhotoDate('2026-02-29'), /date valide/);
  assert.throws(() => validatePhotoDate('2026/10/03'), /date valide/);

  const base = { date: '2026-10-03', mimeType: 'image/jpeg', createdAt: '2026-10-03T10:00:00.000Z' };
  await insertProgressPhoto(db, { ...base, id: 'p1', encryptedFileId: 'f1', encryptedThumbnailId: 't1' });
  await insertProgressPhoto(db, { ...base, id: 'p2', encryptedFileId: 'f2', encryptedThumbnailId: 't2' });
  assert.deepEqual((await listProgressPhotos(db)).map(({ id }) => id), ['p2', 'p1']);
  await assert.rejects(insertProgressPhoto(db, { ...base, id: 'p3', encryptedFileId: 'f1', encryptedThumbnailId: 't3' }));
});

test('photo metadata deletion leaves no row and vault reset clears setup metadata', async () => {
  const { db, id } = await setup();
  const keyId = await prepareProgressVaultSetup(db, id);
  await markProgressVaultConfigured(db, keyId);
  await insertProgressPhoto(db, {
    id: 'photo', date: '2026-10-03', encryptedFileId: 'cipher', encryptedThumbnailId: 'thumbnail',
    mimeType: 'image/heic', createdAt: '2026-10-03T10:00:00.000Z',
  });
  await deleteProgressPhotoMetadata(db, 'photo');
  assert.deepEqual(await listProgressPhotos(db), []);
  await resetProgressVaultMetadata(db);
  assert.deepEqual(await getProgressVaultSettings(db), { setupState: 'unconfigured', keyId: null, autoLockMinutes: 0 });
});

test('auto-lock setting accepts only immediate, one minute, or five minutes', async () => {
  const { db } = await setup();
  assert.equal(await updateProgressVaultAutoLock(db, 5), 5);
  assert.equal((await getProgressVaultSettings(db)).autoLockMinutes, 5);
  for (const value of [-1, 2, 60]) assert.throws(() => validateAutoLockMinutes(value), /délai/);
  assert.equal(autoLockDeadline(10_000, 1), 70_000);
  assert.equal(hasAutoLockExpired(70_000, 69_999), false);
  assert.equal(hasAutoLockExpired(70_000, 70_000), true);
});

test('vault session transitions fail closed and reject stale completions', () => {
  let state = { kind: 'unconfigured' };
  state = transitionVaultSession(state, { type: 'begin_setup_or_unlock' });
  assert.deepEqual(state, { kind: 'unlocking' });
  state = transitionVaultSession(state, { type: 'unlock_succeeded', sessionId: 4 });
  assert.deepEqual(state, { kind: 'unlocked', sessionId: 4 });
  state = transitionVaultSession(state, { type: 'begin_lock' });
  assert.deepEqual(state, { kind: 'locking' });
  state = transitionVaultSession(state, { type: 'lock_finished' });
  assert.deepEqual(state, { kind: 'locked' });
  state = transitionVaultSession(state, { type: 'failed', error: 'key_unavailable' });
  assert.deepEqual(state, { kind: 'error', error: 'key_unavailable' });
  assert.deepEqual(transitionVaultSession(state, { type: 'reset' }), { kind: 'unconfigured' });
  assert.deepEqual(transitionVaultSession({ kind: 'locked' }, { type: 'unlock_succeeded', sessionId: 99 }), { kind: 'locked' });
});

test('AES-GCM vault format supports authenticated round trips and rejects corruption or wrong metadata', () => {
  const key = randomBytes(32);
  assert.equal(key.byteLength, 32);
  const nonce = randomBytes(VAULT_GCM_NONCE_BYTES);
  const plaintext = Buffer.from('private progress photo bytes');
  const aad = vaultAssociatedData('photo-1', '2026-10-03', 'original');
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: VAULT_GCM_TAG_BYTES });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const framed = frameEncryptedContent(Buffer.concat([nonce, body, cipher.getAuthTag()]));
  const combined = Buffer.from(unframeEncryptedContent(framed));
  const decipher = createDecipheriv('aes-256-gcm', key, combined.subarray(0, VAULT_GCM_NONCE_BYTES), { authTagLength: VAULT_GCM_TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(combined.subarray(combined.length - VAULT_GCM_TAG_BYTES));
  assert.deepEqual(Buffer.concat([decipher.update(combined.subarray(VAULT_GCM_NONCE_BYTES, -VAULT_GCM_TAG_BYTES)), decipher.final()]), plaintext);

  const wrongAad = createDecipheriv('aes-256-gcm', key, combined.subarray(0, VAULT_GCM_NONCE_BYTES), { authTagLength: VAULT_GCM_TAG_BYTES });
  wrongAad.setAAD(vaultAssociatedData('photo-1', '2026-10-04', 'original'));
  wrongAad.setAuthTag(combined.subarray(combined.length - VAULT_GCM_TAG_BYTES));
  assert.throws(() => { wrongAad.update(combined.subarray(VAULT_GCM_NONCE_BYTES, -VAULT_GCM_TAG_BYTES)); wrongAad.final(); });

  const corrupted = new Uint8Array(framed);
  corrupted[corrupted.length - 1] ^= 0xff;
  const invalid = Buffer.from(unframeEncryptedContent(corrupted));
  const badTag = createDecipheriv('aes-256-gcm', key, invalid.subarray(0, VAULT_GCM_NONCE_BYTES), { authTagLength: VAULT_GCM_TAG_BYTES });
  badTag.setAAD(aad);
  badTag.setAuthTag(invalid.subarray(invalid.length - VAULT_GCM_TAG_BYTES));
  assert.throws(() => { badTag.update(invalid.subarray(VAULT_GCM_NONCE_BYTES, -VAULT_GCM_TAG_BYTES)); badTag.final(); });
  assert.throws(() => unframeEncryptedContent(new Uint8Array([0, 1, 2])), /invalide ou corrompu/);
});

test('pending key creation requires an authenticated SecureStore read before setup can finish', async () => {
  let value = null;
  let generated = 0;
  let reads = 0;
  const key = await getPendingVaultKey('key-id', {
    async read() { reads += 1; return reads === 1 ? value : value; },
    async write(_id, next) { value = next; },
    async generate() { generated += 1; return 'random-key-material'; },
  });
  assert.equal(key, 'random-key-material');
  assert.equal(generated, 1);
  assert.equal(reads, 2);

  let prompts = 0;
  await assert.rejects(getPendingVaultKey('pending', {
    async read() { prompts += 1; return prompts === 1 ? null : null; },
    async write() {},
    async generate() { return 'temporary-key'; },
  }), /indisponible/);
});

test('configured biometric key failure never creates a replacement key', async () => {
  let generated = 0;
  await assert.rejects(getConfiguredVaultKey('configured', async () => null), /biométrie actuelle/);
  await assert.rejects(getConfiguredVaultKey('configured', async () => { throw new Error('biometric cancelled'); }), /biometric cancelled/);
  assert.equal(generated, 0);
});

test('failed SQLite commit creates no photo row and rolls back ciphertext files', async () => {
  const files = new Map();
  const photo = { id: 'p1', date: '2026-10-03', encryptedFileId: 'f1', encryptedThumbnailId: 't1', mimeType: 'image/jpeg', createdAt: 'now' };
  await assert.rejects(commitEncryptedPhoto({ photo, encryptedOriginal: new Uint8Array([1]), encryptedThumbnail: new Uint8Array([2]), sourceUri: 'source', thumbnailUri: 'thumb' }, {
    async write(id, bytes) { files.set(id, bytes); },
    async delete(id) { files.delete(id); },
    async insert() { throw new Error('simulated sqlite failure'); },
  }), /simulated sqlite failure/);
  assert.deepEqual([...files.keys()], []);
});

test('successful encrypted import writes both ciphertext files before inserting metadata', async () => {
  const sequence = [];
  const photo = { id: 'p2', date: '2026-10-03', encryptedFileId: 'f2', encryptedThumbnailId: 't2', mimeType: 'image/jpeg', createdAt: 'now' };
  await commitEncryptedPhoto({ photo, encryptedOriginal: new Uint8Array([1]), encryptedThumbnail: new Uint8Array([2]), sourceUri: 'source', thumbnailUri: 'thumb' }, {
    async write(id) { sequence.push(`write:${id}`); },
    async delete(id) { sequence.push(`delete:${id}`); },
    async insert() { sequence.push('insert'); },
  });
  assert.deepEqual(sequence, ['write:f2', 'write:t2', 'insert']);
});

test('picker and thumbnail cache inputs are protected, read, and removed before encryption starts', async () => {
  const sequence = [];
  const inputs = await readAndRemovePhotoInputs('picker-cache', 'thumbnail-cache', {
    async protect(uri) { sequence.push(`protect:${uri}`); },
    async read(uri) { sequence.push(`read:${uri}`); return new Uint8Array([uri.length]); },
    async remove(uri) { sequence.push(`remove:${uri}`); },
  });
  assert.deepEqual(inputs.original, new Uint8Array(['picker-cache'.length]));
  assert.deepEqual(inputs.thumbnail, new Uint8Array(['thumbnail-cache'.length]));
  sequence.push('encrypt');
  assert.deepEqual(sequence, [
    'protect:picker-cache', 'protect:thumbnail-cache',
    'read:picker-cache', 'read:thumbnail-cache',
    'remove:picker-cache', 'remove:thumbnail-cache', 'encrypt',
  ]);
});

test('failed cache read still attempts to remove both unencrypted inputs', async () => {
  const removed = [];
  await assert.rejects(readAndRemovePhotoInputs('picker', 'thumbnail', {
    async protect() {},
    async read(uri) { if (uri === 'thumbnail') throw new Error('read failed'); return new Uint8Array([1]); },
    async remove(uri) { removed.push(uri); },
  }), /read failed/);
  assert.deepEqual(removed.sort(), ['picker', 'thumbnail']);
});

test('orphaned ciphertext can be found and removed without touching referenced photo files', () => {
  const photos = [{ id: 'p', date: '2026-10-03', encryptedFileId: 'f', encryptedThumbnailId: 't', mimeType: 'image/jpeg', createdAt: 'now' }];
  assert.deepEqual(findOrphanedVaultFileIds(photos, ['f', 't', 'partial']), ['partial']);
});

test('photo deletion removes metadata first and then both encrypted files', async () => {
  const calls = [];
  let metadataRemoved = false;
  const photo = { id: 'p', date: '2026-10-03', encryptedFileId: 'f', encryptedThumbnailId: 't', mimeType: 'image/jpeg', createdAt: 'now' };
  await deleteEncryptedPhoto(photo, async (id) => { calls.push(`metadata:${id}`); metadataRemoved = true; }, async (id) => {
    assert.equal(metadataRemoved, true);
    calls.push(`file:${id}`);
  });
  assert.equal(calls[0], 'metadata:p');
  assert.deepEqual(calls.slice(1).sort(), ['file:f', 'file:t']);
});

test('delete-all clears SQLite references before removing encrypted vault files', async () => {
  const calls = [];
  await deleteEncryptedPhotoCollection(async () => calls.push('metadata'), async () => calls.push('files'));
  assert.deepEqual(calls, ['metadata', 'files']);
});

test('explicit Photos export removes the protected temporary file after saving or failure', async () => {
  const calls = [];
  await exportPhotoExplicitly(new Uint8Array([1, 2]), {
    async write() { calls.push('write'); },
    async protect() { calls.push('protect'); },
    async saveToPhotos() { calls.push('save'); },
    async remove() { calls.push('remove'); },
  });
  assert.deepEqual(calls, ['protect', 'write', 'save', 'remove']);
  calls.length = 0;
  await assert.rejects(exportPhotoExplicitly(new Uint8Array([1]), {
    async write() { calls.push('write'); },
    async protect() { calls.push('protect'); },
    async saveToPhotos() { throw new Error('permission denied'); },
    async remove() { calls.push('remove'); },
  }), /permission denied/);
  assert.deepEqual(calls, ['protect', 'write', 'remove']);
});
