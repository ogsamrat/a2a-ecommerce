import type { OnChainListing } from "@/lib/agents/types";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_RECENT_LISTINGS = 300;
const CACHE_FILE = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "remembered-listings.json",
);

const registry = new Map<string, OnChainListing>();
let isHydrated = false;
let hydrationPromise: Promise<void> | null = null;

function normalizeListing(input: OnChainListing): OnChainListing {
  return {
    ...input,
    txId: String(input.txId || ""),
    sender: String(input.sender || input.seller || ""),
    seller: String(input.seller || ""),
    type: String(input.type || "unknown"),
    service: String(input.service || "Unnamed Service"),
    description: String(input.description || ""),
    price: Number.isFinite(Number(input.price)) ? Number(input.price) : 0,
    timestamp: Number.isFinite(Number(input.timestamp))
      ? Number(input.timestamp)
      : Date.now(),
    round: Number.isFinite(Number(input.round)) ? Number(input.round) : 0,
    zkCommitment:
      typeof input.zkCommitment === "string" ? input.zkCommitment : undefined,
  };
}

function pruneRegistry() {
  if (registry.size <= MAX_RECENT_LISTINGS) return;

  const toDelete = registry.size - MAX_RECENT_LISTINGS;
  const oldest = [...registry.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, toDelete);

  for (const entry of oldest) {
    registry.delete(entry.txId);
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
        const listing = normalizeListing(item as OnChainListing);
        if (!listing.txId) continue;
        registry.set(listing.txId, listing);
      }
      pruneRegistry();
    } catch {
      // first run or malformed file: keep in-memory empty
    } finally {
      isHydrated = true;
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export async function rememberListing(listing: OnChainListing): Promise<void> {
  await hydrateFromDisk();

  const normalized = normalizeListing(listing);
  if (!normalized.txId) return;

  registry.set(normalized.txId, normalized);
  pruneRegistry();
  await persistToDisk();
}

export async function rememberListings(
  listings: OnChainListing[],
): Promise<void> {
  await hydrateFromDisk();

  for (const listing of listings) {
    const normalized = normalizeListing(listing);
    if (!normalized.txId) continue;
    registry.set(normalized.txId, normalized);
  }
  pruneRegistry();
  await persistToDisk();
}

export async function getRememberedListings(): Promise<OnChainListing[]> {
  await hydrateFromDisk();
  return [...registry.values()].sort((a, b) => {
    if (b.round !== a.round) return b.round - a.round;
    return b.timestamp - a.timestamp;
  });
}
