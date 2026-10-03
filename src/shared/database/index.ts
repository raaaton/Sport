import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { RunResult, SportDatabase, SqlValue } from './contract';
import { migrateAndSeed } from './schema';

const DATABASE_NAME = 'sport.db';

let databasePromise: Promise<SQLiteDatabase> | undefined;
let initializedPromise: Promise<SportDatabase> | undefined;

function adaptDatabase(database: SQLiteDatabase): SportDatabase {
  return {
    execAsync: async (sql) => { await database.execAsync(sql); },
    runAsync: async (sql, ...params: SqlValue[]): Promise<RunResult> => database.runAsync(sql, ...params),
    getFirstAsync: async <T>(sql: string, ...params: SqlValue[]) => database.getFirstAsync<T>(sql, ...params),
    getAllAsync: async <T>(sql: string, ...params: SqlValue[]) => database.getAllAsync<T>(sql, ...params),
    withExclusiveTransactionAsync: async <T>(task: (transaction: SportDatabase) => Promise<T>) => {
      let result!: T;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = await task(adaptDatabase(transaction as unknown as SQLiteDatabase));
      });
      return result;
    },
  };
}

/** Opens, migrates, and idempotently seeds the local source-of-truth database. */
export async function getDatabase(): Promise<SportDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  if (!initializedPromise) {
    initializedPromise = databasePromise.then(async (database) => {
      await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
      const adapter = adaptDatabase(database);
      await migrateAndSeed(adapter);
      return adapter;
    }).catch((error: unknown) => {
      initializedPromise = undefined;
      throw error;
    });
  }
  return initializedPromise;
}
