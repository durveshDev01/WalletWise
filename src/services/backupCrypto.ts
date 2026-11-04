import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytesAsync } from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const ITERATIONS = 600_000;
const encoder = new TextEncoder();

export type EncryptedBackup = {
  format: 'walletwise-e2ee';
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  ciphertext: string;
};

export type BackupKey = { key: Uint8Array; salt: Uint8Array };

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('Cloud backup is malformed.');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

function associatedData(userId: string) {
  return encoder.encode(`walletwise/cloud-backup/v1/${userId}/walletwise-state-v1`);
}

export async function deriveBackupKey(passphrase: string, salt: Uint8Array) {
  const normalized = passphrase.normalize('NFKC');
  return pbkdf2Async(sha256, normalized, salt, { c: ITERATIONS, dkLen: 32, asyncTick: 12 });
}

export async function newBackupKey(passphrase: string): Promise<BackupKey> {
  if (passphrase.trim().length < 12) throw new Error('Use a backup passphrase with at least 12 characters.');
  const salt = await getRandomBytesAsync(16);
  const key = await deriveBackupKey(passphrase, salt);
  return { key, salt };
}

export async function encryptBackup(snapshot: unknown, userId: string, { key, salt }: BackupKey): Promise<EncryptedBackup> {
  const aesKey = await AESEncryptionKey.import(key);
  const plaintext = encoder.encode(JSON.stringify(snapshot));
  const sealed = await aesEncryptAsync(plaintext, aesKey, { additionalData: associatedData(userId) });
  const ciphertext = await sealed.combined('base64');
  return { format: 'walletwise-e2ee', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toHex(salt), ciphertext };
}

export async function decryptBackup(payload: unknown, userId: string, passphrase: string): Promise<{ snapshot: unknown; backupKey: BackupKey }> {
  if (!payload || typeof payload !== 'object') throw new Error('No encrypted backup exists for this account.');
  const envelope = payload as Partial<EncryptedBackup>;
  if (envelope.format !== 'walletwise-e2ee' || envelope.version !== 1 || envelope.kdf !== 'PBKDF2-SHA256'
      || envelope.iterations !== ITERATIONS || typeof envelope.salt !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('This cloud backup format is unsupported.');
  }
  const salt = fromHex(envelope.salt);
  if (salt.length !== 16) throw new Error('Cloud backup has an invalid recovery salt.');
  const key = await deriveBackupKey(passphrase, salt);
  const aesKey = await AESEncryptionKey.import(key);
  let plaintext: Uint8Array;
  try {
    plaintext = await aesDecryptAsync(AESSealedData.fromCombined(envelope.ciphertext), aesKey, { additionalData: associatedData(userId) }) as Uint8Array;
  } catch {
    throw new Error('That passphrase could not unlock this backup.');
  }
  try {
    return { snapshot: JSON.parse(new TextDecoder().decode(plaintext)), backupKey: { key, salt } };
  } catch {
    throw new Error('The decrypted backup is invalid.');
  }
}

export function serializeBackupKey({ key, salt }: BackupKey) {
  return `${toHex(salt)}:${toHex(key)}`;
}

export function parseBackupKey(value: string): BackupKey {
  const [saltHex, keyHex, extra] = value.split(':');
  if (!saltHex || !keyHex || extra) throw new Error('Saved backup key is invalid.');
  const salt = fromHex(saltHex);
  const key = fromHex(keyHex);
  if (salt.length !== 16 || key.length !== 32) throw new Error('Saved backup key has an invalid length.');
  return { key, salt };
}
