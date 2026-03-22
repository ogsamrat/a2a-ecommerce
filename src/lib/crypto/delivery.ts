import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;

function getRawKeyMaterial(): string {
  const fromEnv = process.env.DELIVERY_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error("DELIVERY_ENCRYPTION_KEY is required in production");
  }

  return "dev-only-delivery-key-change-me";
}

function getAesKey(): Buffer {
  const raw = getRawKeyMaterial();
  return createHash("sha256")
    .update(raw, "utf8")
    .digest()
    .subarray(0, KEY_BYTES);
}

export function encryptDeliveryPayload(plaintext: string): string {
  const key = getAesKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptDeliveryPayload(payload: string): string {
  const [version, ivB64, tagB64, encryptedB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted delivery payload format");
  }

  const key = getAesKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
