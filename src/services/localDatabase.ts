import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { getRandomBytesAsync } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_NAME = 'walletwise.sqlite.key.v1';
let opening: Promise<SQLite.SQLiteDatabase> | undefined;

async function encryptionKey() {
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    const bytes = await getRandomBytesAsync(32);
    key = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key);
  }
  return key;
}

export function openLocalDatabase() {
  if (!opening) opening = (async () => {
    const key = await encryptionKey();
    const db = await SQLite.openDatabaseAsync('walletwise.db');
    const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new Error('Encrypted storage is unavailable. Install a native build with SQLCipher enabled.');
    await db.execAsync(`PRAGMA key = '${key}'`);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_records(id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, sync_state TEXT NOT NULL DEFAULT 'pending');
      CREATE INDEX IF NOT EXISTS user_records_kind_idx ON user_records(kind);
      CREATE INDEX IF NOT EXISTS user_records_sync_idx ON user_records(sync_state, updated_at);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));`);
    return db;
  })().catch((error) => { opening = undefined; throw error; });
  return opening;
}

export async function saveLocalRecord(id: string, kind: string, payload: unknown) {
  const db = await openLocalDatabase();
  await db.runAsync(`INSERT INTO user_records(id,kind,payload,updated_at,deleted_at,sync_state) VALUES(?,?,?,?,NULL,'pending')
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,updated_at=excluded.updated_at,deleted_at=NULL,sync_state='pending'`,
  id, kind, JSON.stringify(payload), new Date().toISOString());
}

async function saveSerializedStore(id: string, value: string, syncState: 'pending' | 'synced' = 'pending') {
  const db = await openLocalDatabase();
  await db.runAsync(`INSERT INTO user_records(id,kind,payload,updated_at,deleted_at,sync_state) VALUES(?,'app_state',?,?,NULL,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,deleted_at=NULL,sync_state=excluded.sync_state`,
  id, value, new Date().toISOString(), syncState);
}

export async function exportLocalRecords() {
  const db = await openLocalDatabase();
  return db.getAllAsync('SELECT id,kind,payload,updated_at,deleted_at FROM user_records');
}

export async function getLocalRecord(id: string) {
  const db = await openLocalDatabase();
  return db.getFirstAsync<{ id: string; kind: string; payload: string; updated_at: string; deleted_at: string | null }>(
    'SELECT id,kind,payload,updated_at,deleted_at FROM user_records WHERE id = ?', id,
  );
}

export async function restoreLocalRecord(id: string, kind: string, payload: unknown, updatedAt: string) {
  const db = await openLocalDatabase();
  await db.runAsync(`INSERT INTO user_records(id,kind,payload,updated_at,deleted_at,sync_state) VALUES(?,?,?,?,NULL,'synced')
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,updated_at=excluded.updated_at,deleted_at=NULL,sync_state='synced'`,
  id, kind, JSON.stringify(payload), updatedAt);
}

export const encryptedZustandStorage = {
  async getItem(name: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(name);
    const db = await openLocalDatabase();
    const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM user_records WHERE id = ?', `zustand:${name}`);
    if (row?.payload != null) return row.payload;
    // One-time migration from the previous AsyncStorage-backed Zustand store.
    const legacy = await AsyncStorage.getItem(name);
    if (legacy != null) {
      await saveSerializedStore(`zustand:${name}`, legacy, 'synced');
      await AsyncStorage.removeItem(name);
    }
    return legacy;
  },
  async setItem(name: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(name, value);
    await saveSerializedStore(`zustand:${name}`, value);
  },
  async removeItem(name: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(name);
    const db = await openLocalDatabase();
    await db.runAsync('DELETE FROM user_records WHERE id = ?', `zustand:${name}`);
  },
};
