/**
 * Server-side credential store.
 *
 * Sellers provide username + password when listing a service.
 * Credentials are AES-256-GCM encrypted at rest in server memory.
 * They are only decrypted and returned after x402 payment is verified.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import fs from "fs";
import path from "path";

export interface CredentialEntry {
  txId: string;
  service: string;
  sellerAddress: string;
  price: number;
  encryptedData: string; // base64(authTag + ciphertext)
  iv: string; // base64
  keyHash: string; // sha256 of the encryption key (for lookup, NOT the key itself)
  _key: string; // base64 AES-256 key — kept in memory only, never sent to client
}

// ── Global credential store (survives Next.js hot-reload in dev) ──────────────
declare global {
  // eslint-disable-next-line no-var
  var __a2aCredentialStore: Map<string, CredentialEntry> | undefined;
}
if (!globalThis.__a2aCredentialStore)
  globalThis.__a2aCredentialStore = new Map();

const CREDENTIAL_STORE_FILE = path.join(
  process.cwd(),
  ".a2a-credentials-store.json",
);

function loadPersistedCredentials(): void {
  if (
    !globalThis.__a2aCredentialStore ||
    globalThis.__a2aCredentialStore.size > 0
  )
    return;
  try {
    if (!fs.existsSync(CREDENTIAL_STORE_FILE)) return;
    const raw = fs.readFileSync(CREDENTIAL_STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CredentialEntry[];
    for (const entry of parsed) {
      if (entry?.txId) globalThis.__a2aCredentialStore.set(entry.txId, entry);
    }
  } catch {
    // best-effort; keep in-memory store empty if file is unreadable
  }
}

function persistCredentials(): void {
  try {
    const entries = Array.from(globalThis.__a2aCredentialStore!.values());
    fs.writeFileSync(CREDENTIAL_STORE_FILE, JSON.stringify(entries), "utf-8");
  } catch {
    // best-effort persistence
  }
}

export function getCredentialStore(): Map<string, CredentialEntry> {
  loadPersistedCredentials();
  return globalThis.__a2aCredentialStore!;
}

// ── Encryption helpers ────────────────────────────────────────────────────────

function encrypt(
  plaintext: string,
  key: Buffer,
): { encryptedData: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16-byte auth tag
  return {
    encryptedData: Buffer.concat([tag, encrypted]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

function decrypt(encryptedData: string, iv: string, key: Buffer): string {
  const buf = Buffer.from(encryptedData, "base64");
  const tag = buf.slice(0, 16);
  const ciphertext = buf.slice(16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface StoredCredentials {
  username: string;
  password: string;
  productType?: string;
  notes?: string;
}

/**
 * Encrypt + store credentials keyed by the listing TX ID.
 * Returns the keyHash for verification purposes.
 */
export function storeCredentials(params: {
  txId: string;
  service: string;
  sellerAddress: string;
  price: number;
  credentials: StoredCredentials;
}): string {
  loadPersistedCredentials();
  const key = randomBytes(32);
  const plaintext = JSON.stringify(params.credentials);
  const { encryptedData, iv } = encrypt(plaintext, key);
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyB64 = key.toString("base64");

  const entry: CredentialEntry = {
    txId: params.txId,
    service: params.service,
    sellerAddress: params.sellerAddress,
    price: params.price,
    encryptedData,
    iv,
    keyHash,
    _key: keyB64,
  };

  globalThis.__a2aCredentialStore!.set(params.txId, entry);
  persistCredentials();
  return keyHash;
}

/** Decrypt and return credentials for a given TX ID. */
export function decryptCredentials(txId: string): StoredCredentials | null {
  loadPersistedCredentials();
  const entry = globalThis.__a2aCredentialStore!.get(txId);
  if (!entry) return null;
  try {
    const key = Buffer.from(entry._key, "base64");
    const plaintext = decrypt(entry.encryptedData, entry.iv, key);
    return JSON.parse(plaintext) as StoredCredentials;
  } catch {
    return null;
  }
}

/** Get the credential entry metadata (without decrypting) for x402 price/payTo info. */
export function getCredentialEntry(txId: string): CredentialEntry | null {
  loadPersistedCredentials();
  return globalThis.__a2aCredentialStore!.get(txId) ?? null;
}

/** Return all credential entries (metadata only, no decryption). */
export function getAllEntries(): CredentialEntry[] {
  loadPersistedCredentials();
  return Array.from(globalThis.__a2aCredentialStore!.values());
}
