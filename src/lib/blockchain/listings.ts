import { getIndexer } from "./algorand";
import algosdk from "algosdk";
import type { OnChainListing } from "@/lib/agents/types";

const LISTING_PREFIX = "a2a-listing:";

interface ListingData {
  type: string;
  service: string;
  price: number;
  seller: string;
  description: string;
  timestamp: number;
  zkCommitment?: string;
  deliveryKind?: string;
  accessDurationDays?: number;
}

const QUERY_TIMEOUT_MS = parseInt(
  process.env.INDEXER_QUERY_TIMEOUT_MS ?? "9000",
  10,
);

const sellerSecrets = new Map<string, string>();

export function getSellerSecret(seller: string): string | undefined {
  return sellerSecrets.get(seller);
}

export async function postListingsOnChain(): Promise<string[]> {
  return [];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("query timeout")), timeoutMs);
    }),
  ]);
}

function decodeNote(noteRaw: unknown): string {
  if (!noteRaw) return "";
  if (typeof noteRaw === "string") {
    try {
      return Buffer.from(noteRaw, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
  if (noteRaw instanceof Uint8Array) {
    return new TextDecoder().decode(noteRaw);
  }
  return "";
}

function parseListingNote(noteStr: string): ListingData | null {
  if (!noteStr.startsWith(LISTING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      noteStr.slice(LISTING_PREFIX.length),
    ) as ListingData;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchListingsFromChain(): Promise<OnChainListing[]> {
  const indexer = getIndexer();

  let currentRound = 0;
  try {
    const health = await withTimeout(indexer.makeHealthCheck().do(), 2000);
    currentRound = Number(health.round ?? 0);
  } catch {
    // skip
  }

  const listings: OnChainListing[] = [];
  const searchResult = await withTimeout(
    (async () => {
      let req = indexer
        .searchForTransactions()
        .notePrefix(Buffer.from(LISTING_PREFIX).toString("base64"))
        .txType("pay")
        .limit(250);
      if (currentRound > 0)
        req = req.minRound(Math.max(0, currentRound - 500000));
      return req.do();
    })(),
    QUERY_TIMEOUT_MS,
  );

  const txns = searchResult.transactions ?? [];
  for (const txn of txns) {
    try {
      const noteRaw = txn.note;
      if (!noteRaw) continue;

      const noteStr = decodeNote(noteRaw);
      const data = parseListingNote(noteStr);
      if (!data) continue;

      try {
        algosdk.Address.fromString(String(data.seller));
      } catch {
        continue;
      }

      listings.push({
        txId: txn.id ?? "",
        sender: txn.sender ?? "",
        type: data.type,
        service: data.service,
        price: data.price,
        seller: data.seller,
        description: data.description,
        timestamp: data.timestamp,
        zkCommitment: data.zkCommitment,
        deliveryKind: data.deliveryKind as OnChainListing["deliveryKind"],
        accessDurationDays:
          data.accessDurationDays !== undefined &&
          Number.isFinite(Number(data.accessDurationDays))
            ? Number(data.accessDurationDays)
            : undefined,
        round: Number(txn.confirmedRound ?? 0),
      });
    } catch {
      // skip malformed notes
    }
  }

  return listings;
}

export async function fetchListingByTxId(
  listingTxId: string,
): Promise<OnChainListing | null> {
  if (!listingTxId?.trim()) return null;

  const indexer = getIndexer();
  const lookup = await withTimeout(
    indexer.lookupTransactionByID(listingTxId).do(),
    QUERY_TIMEOUT_MS,
  );
  const txn = (
    lookup as {
      transaction?: {
        id?: string;
        sender?: string;
        note?: unknown;
        confirmedRound?: number | bigint;
      };
    }
  ).transaction;

  if (!txn?.id) return null;
  const noteStr = decodeNote(txn.note);
  const data = parseListingNote(noteStr);
  if (!data) return null;

  try {
    algosdk.Address.fromString(String(data.seller));
  } catch {
    return null;
  }

  return {
    txId: txn.id,
    sender: txn.sender ?? "",
    type: data.type,
    service: data.service,
    price: data.price,
    seller: data.seller,
    description: data.description,
    timestamp: data.timestamp,
    zkCommitment: data.zkCommitment,
    deliveryKind: data.deliveryKind as OnChainListing["deliveryKind"],
    accessDurationDays:
      data.accessDurationDays !== undefined &&
      Number.isFinite(Number(data.accessDurationDays))
        ? Number(data.accessDurationDays)
        : undefined,
    round: Number(txn.confirmedRound ?? 0),
  };
}

export function filterListings(
  listings: OnChainListing[],
  serviceType: string,
  maxBudget: number,
): OnChainListing[] {
  const normalized = serviceType.toLowerCase().replace(/[\s_-]+/g, "-");

  if (normalized === "all" || normalized === "unknown") {
    return listings.filter((l) => l.price <= maxBudget);
  }

  return listings.filter((l) => {
    const rawSearch = serviceType.toLowerCase().trim();
    const typeMatch =
      l.type === normalized ||
      l.service.toLowerCase().includes(rawSearch) ||
      l.service.toLowerCase().includes(normalized.replace(/-/g, " ")) ||
      l.type.includes(normalized.split("-")[0]);
    return typeMatch && l.price <= maxBudget;
  });
}
