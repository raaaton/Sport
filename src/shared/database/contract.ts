export type SqlValue = string | number | null | Uint8Array;

export type RunResult = { changes: number; lastInsertRowId: number };

/** Small boundary shared by Expo SQLite and the dependency-free Node test adapter. */
export interface SportDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<RunResult>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withExclusiveTransactionAsync<T>(task: (transaction: SportDatabase) => Promise<T>): Promise<T>;
}
