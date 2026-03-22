import { promises as fs } from "node:fs";
import path from "node:path";
import type { DeliveryRecord } from "@/lib/agents/types";
import {
  decryptDeliveryPayload,
  encryptDeliveryPayload,
} from "@/lib/crypto/delivery";

const FILE_PATH = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "deliveries.json",
);

interface DeliveryLedger {
  deliveries: Record<string, StoredDeliveryRecord>;
}

interface StoredDeliveryRecord extends Omit<
  DeliveryRecord,
  "fields" | "instructions"
> {
  encryptedPayload?: string;
  fields?: Record<string, string>;
  instructions?: string;
}

async function ensureFile(): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  try {
    await fs.access(FILE_PATH);
  } catch {
    const initial: DeliveryLedger = { deliveries: {} };
    await fs.writeFile(FILE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readLedger(): Promise<DeliveryLedger> {
  await ensureFile();
  const raw = await fs.readFile(FILE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as DeliveryLedger;
    if (!parsed.deliveries) return { deliveries: {} };
    return parsed;
  } catch {
    return { deliveries: {} };
  }
}

async function writeLedger(ledger: DeliveryLedger): Promise<void> {
  await ensureFile();
  await fs.writeFile(FILE_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

export async function getDelivery(
  orderTxId: string,
): Promise<DeliveryRecord | null> {
  const ledger = await readLedger();
  const stored = ledger.deliveries[orderTxId];
  if (!stored) return null;

  // Backward compatibility: read plaintext legacy records if present.
  if (!stored.encryptedPayload) {
    const legacyFields = stored.fields ?? {};
    const legacyInstructions = stored.instructions;

    // Migrate legacy plaintext record to encrypted-at-rest representation.
    stored.encryptedPayload = encryptDeliveryPayload(
      JSON.stringify({
        fields: legacyFields,
        instructions: legacyInstructions,
      }),
    );
    delete stored.fields;
    delete stored.instructions;
    await writeLedger(ledger);

    return {
      orderTxId: stored.orderTxId,
      seller: stored.seller,
      deliveredAt: stored.deliveredAt,
      deliveryKind: stored.deliveryKind,
      fields: legacyFields,
      instructions: legacyInstructions,
    };
  }

  const payloadStr = decryptDeliveryPayload(stored.encryptedPayload);
  const payloadUnknown: unknown = JSON.parse(payloadStr);
  const payload =
    typeof payloadUnknown === "object" && payloadUnknown !== null
      ? (payloadUnknown as {
          fields?: Record<string, string>;
          instructions?: string;
        })
      : {};

  return {
    orderTxId: stored.orderTxId,
    seller: stored.seller,
    deliveredAt: stored.deliveredAt,
    deliveryKind: stored.deliveryKind,
    fields: payload.fields ?? {},
    instructions: payload.instructions,
  };
}

export async function setDelivery(
  record: DeliveryRecord,
): Promise<DeliveryRecord> {
  if (!record.orderTxId) throw new Error("orderTxId is required");
  if (!record.seller) throw new Error("seller is required");
  if (!record.deliveryKind) throw new Error("deliveryKind is required");
  if (!record.fields || typeof record.fields !== "object") {
    throw new Error("fields must be an object");
  }

  const ledger = await readLedger();
  const encryptedPayload = encryptDeliveryPayload(
    JSON.stringify({
      fields: record.fields,
      instructions: record.instructions,
    }),
  );

  ledger.deliveries[record.orderTxId] = {
    orderTxId: record.orderTxId,
    seller: record.seller,
    deliveredAt: Number.isFinite(Number(record.deliveredAt))
      ? Number(record.deliveredAt)
      : Date.now(),
    deliveryKind: record.deliveryKind,
    encryptedPayload,
  };
  await writeLedger(ledger);

  return {
    orderTxId: record.orderTxId,
    seller: record.seller,
    deliveredAt: ledger.deliveries[record.orderTxId].deliveredAt,
    deliveryKind: record.deliveryKind,
    fields: record.fields,
    instructions: record.instructions,
  };
}
