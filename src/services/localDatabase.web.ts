import AsyncStorage from '@react-native-async-storage/async-storage';

const RECORD_PREFIX = 'walletwise-record:';

type LocalRecord = { id: string; kind: string; payload: string; updated_at: string; deleted_at: string | null };

export async function openLocalDatabase(): Promise<never> {
  throw new Error('SQLite is available only in native WalletWise builds.');
}

export async function saveLocalRecord(id: string, kind: string, payload: unknown) {
  const row: LocalRecord = { id, kind, payload: JSON.stringify(payload), updated_at: new Date().toISOString(), deleted_at: null };
  await AsyncStorage.setItem(`${RECORD_PREFIX}${id}`, JSON.stringify(row));
}

export async function exportLocalRecords(): Promise<LocalRecord[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(RECORD_PREFIX));
  const entries = await AsyncStorage.multiGet(keys);
  return entries.flatMap(([, value]) => {
    if (!value) return [];
    try { return [JSON.parse(value) as LocalRecord]; } catch { return []; }
  });
}

export async function getLocalRecord(id: string) {
  const value = await AsyncStorage.getItem(`${RECORD_PREFIX}${id}`);
  return value ? JSON.parse(value) as LocalRecord : null;
}

export async function restoreLocalRecord(id: string, kind: string, payload: unknown, updatedAt: string) {
  const row: LocalRecord = { id, kind, payload: JSON.stringify(payload), updated_at: updatedAt, deleted_at: null };
  await AsyncStorage.setItem(`${RECORD_PREFIX}${id}`, JSON.stringify(row));
}

// Browser storage is for web previews and is not encrypted at rest. Native builds
// resolve localDatabase.ts and use SQLCipher with a key held in SecureStore.
export const encryptedZustandStorage = {
  getItem: (name: string) => typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(name),
  setItem: (name: string, value: string) => typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(name, value),
  removeItem: (name: string) => typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(name),
};
