import { promises as fs } from "node:fs";
import path from "node:path";
import type { OrderRecord } from "@/lib/agents/types";

const MAX_RECENT_ORDERS = 500;
const CACHE_FILE = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "remembered-orders.json",
);

const registry = new Map<string, OrderRecord>();
let isHydrated = false;
let hydrationPromise: Promise<void> | null = null;

function normalizeOrder(input: OrderRecord): OrderRecord {
  return {
    orderTxId: String(input.orderTxId || ""),
    listingTxId: String(input.listingTxId || ""),
    buyer: String(input.buyer || ""),
    seller: String(input.seller || ""),
    type: String(input.type || "unknown"),
    service: String(input.service || "Unnamed Service"),
    price: Number.isFinite(Number(input.price)) ? Number(input.price) : 0,
    description: String(input.description || ""),
    deliveryKind: input.deliveryKind,
    accessDurationDays:
      input.accessDurationDays !== undefined &&
      Number.isFinite(Number(input.accessDurationDays))
        ? Number(input.accessDurationDays)
        : undefined,
    createdAt: Number.isFinite(Number(input.createdAt))
      ? Number(input.createdAt)
      : Date.now(),
    confirmedRound: Number.isFinite(Number(input.confirmedRound))
      ? Number(input.confirmedRound)
      : 0,
  };
}

function pruneRegistry(): void {
  const items = [...registry.values()].sort((a, b) => {
    if (b.confirmedRound !== a.confirmedRound)
      return b.confirmedRound - a.confirmedRound;
    return b.createdAt - a.createdAt;
  });

  registry.clear();
  for (const item of items.slice(0, MAX_RECENT_ORDERS)) {
    registry.set(item.orderTxId, item);
  }
}

async function persistToDisk(): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  const payload = JSON.stringify([...registry.values()]);
  await fs.writeFile(CACHE_FILE, payload, "utf-8");
}

async function hydrateFromDisk(): Promise<void> {
  if (isHydrated) return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const raw = await fs.readFile(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        isHydrated = true;
        return;
      }

      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const order = normalizeOrder(item as OrderRecord);
        if (!order.orderTxId) continue;
        registry.set(order.orderTxId, order);
      }
      pruneRegistry();
    } catch {
      // ignore
    } finally {
      isHydrated = true;
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export async function rememberOrder(order: OrderRecord): Promise<void> {
  await hydrateFromDisk();
  const normalized = normalizeOrder(order);
  if (!normalized.orderTxId) return;
  registry.set(normalized.orderTxId, normalized);
  pruneRegistry();
  await persistToDisk();
}

export async function rememberOrders(orders: OrderRecord[]): Promise<void> {
  await hydrateFromDisk();
  for (const order of orders) {
    const normalized = normalizeOrder(order);
    if (!normalized.orderTxId) continue;
    registry.set(normalized.orderTxId, normalized);
  }
  pruneRegistry();
  await persistToDisk();
}

export async function getRememberedOrders(): Promise<OrderRecord[]> {
  await hydrateFromDisk();
  return [...registry.values()].sort((a, b) => {
    if (b.confirmedRound !== a.confirmedRound)
      return b.confirmedRound - a.confirmedRound;
    return b.createdAt - a.createdAt;
  });
}
