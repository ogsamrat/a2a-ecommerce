import { promises as fs } from "node:fs";
import path from "node:path";
import type { DeliveryRecord } from "@/lib/agents/types";

const FILE_PATH = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "deliveries.json",
);

interface DeliveryLedger {
  deliveries: Record<string, DeliveryRecord>;
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
  return ledger.deliveries[orderTxId] ?? null;
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
  ledger.deliveries[record.orderTxId] = {
    ...record,
    deliveredAt: Number.isFinite(Number(record.deliveredAt))
      ? Number(record.deliveredAt)
      : Date.now(),
  };
  await writeLedger(ledger);
  return ledger.deliveries[record.orderTxId];
}
