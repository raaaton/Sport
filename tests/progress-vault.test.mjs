import assert from 'node:assert/strict';
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
