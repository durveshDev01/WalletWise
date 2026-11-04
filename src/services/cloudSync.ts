import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { decryptBackup, encryptBackup, newBackupKey, parseBackupKey, serializeBackupKey } from './backupCrypto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const BACKUP_KEY_PREFIX = 'walletwise.cloud-backup-key.v1.';
const webBackupKeys = new Map<string, string>();

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { storage: {
    getItem: (key) => Platform.OS === 'web'
      ? (typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key))
      : SecureStore.getItemAsync(key),
    setItem: (key, value) => Platform.OS === 'web'
      ? (typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
    removeItem: (key) => Platform.OS === 'web'
      ? (typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key))
      : SecureStore.deleteItemAsync(key),
  }, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
}) : null;

type BackupRow = { payload: unknown; updated_at: string };
type UserSession = { id: string; email?: string };

async function currentUser(): Promise<UserSession> {
  if (!supabase) throw new Error('Cloud backup is not configured.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sign in before using cloud backup.');
  return user;
}

async function readBackup(userId: string): Promise<BackupRow | null> {
  if (!supabase) throw new Error('Cloud backup is not configured.');
  const { data, error } = await supabase.from('user_data').select('payload, updated_at')
    .eq('user_id', userId).eq('record_id', 'walletwise-state-v1').is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data as BackupRow | null;
}

async function saveKeyForUser(userId: string, serializedKey: string) {
  if (Platform.OS === 'web') webBackupKeys.set(userId, serializedKey);
  else await SecureStore.setItemAsync(`${BACKUP_KEY_PREFIX}${userId}`, serializedKey);
}

async function readKeyForUser(userId: string) {
  if (Platform.OS === 'web') return webBackupKeys.get(userId) ?? null;
  return SecureStore.getItemAsync(`${BACKUP_KEY_PREFIX}${userId}`);
}

export async function hasUnlockedWalletBackup() {
  try {
    const user = await currentUser();
    return (await readKeyForUser(user.id)) !== null;
  } catch {
    return false;
  }
}

export async function getWalletBackupStatus() {
  const user = await currentUser();
  const row = await readBackup(user.id);
  return { exists: !!row, updatedAt: row?.updated_at ?? null, unlocked: (await readKeyForUser(user.id)) !== null };
}

/** Create or update the signed-in user's encrypted backup. A passphrase is required on first use. */
export async function saveWalletSnapshot(snapshot: unknown, passphrase?: string) {
  if (!supabase) throw new Error('Cloud backup is not configured.');
  const user = await currentUser();
  const row = await readBackup(user.id);
  let backupKey;

  if (row) {
    if (passphrase) {
      // Decrypt the previous envelope first: a wrong passphrase must never overwrite recovery data.
      backupKey = (await decryptBackup(row.payload, user.id, passphrase)).backupKey;
    } else {
      const serialized = await readKeyForUser(user.id);
      if (!serialized) throw new Error('Enter your backup passphrase to unlock this account on this device.');
      backupKey = parseBackupKey(serialized);
    }
  } else {
    if (!passphrase) throw new Error('Create a backup passphrase before the first encrypted backup.');
    backupKey = await newBackupKey(passphrase);
  }

  const payload = await encryptBackup(snapshot, user.id, backupKey);
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('user_data').upsert({
    user_id: user.id,
    record_id: 'walletwise-state-v1',
    record_type: 'app_state',
    payload,
    updated_at: updatedAt,
    deleted_at: null,
  }, { onConflict: 'user_id,record_id' });
  if (error) throw error;
  await saveKeyForUser(user.id, serializeBackupKey(backupKey));
  return { updatedAt };
}

/** Decrypts only on this client. The passphrase is never sent to Supabase. */
export async function loadWalletSnapshot(passphrase: string) {
  const user = await currentUser();
  const row = await readBackup(user.id);
  if (!row) return null;
  const decrypted = await decryptBackup(row.payload, user.id, passphrase);
  await saveKeyForUser(user.id, serializeBackupKey(decrypted.backupKey));
  return { snapshot: decrypted.snapshot, updatedAt: row.updated_at };
}

