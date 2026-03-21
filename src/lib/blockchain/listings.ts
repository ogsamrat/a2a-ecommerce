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

      const noteStr =
        typeof noteRaw === "string"
          ? Buffer.from(noteRaw, "base64").toString("utf-8")
          : new TextDecoder().decode(noteRaw as Uint8Array);
      if (!noteStr.startsWith(LISTING_PREFIX)) continue;

      const data: ListingData = JSON.parse(
        noteStr.slice(LISTING_PREFIX.length),
      );

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
        round: Number(txn.confirmedRound ?? 0),
      });
    } catch {
      // skip malformed notes
    }
  }

  return listings;
}

export function filterListings(
  listings: OnChainListing[],
  serviceType: string,
  maxBudget: number,
): OnChainListing[] {
  const normalized = serviceType.toLowerCase().replace(/[\s_-]+/g, "-");
  return listings.filter((l) => {
    const typeMatch =
      l.type === normalized ||
      l.service.toLowerCase().includes(normalized.replace(/-/g, " ")) ||
      l.type.includes(normalized.split("-")[0]);
    return typeMatch && l.price <= maxBudget;
  });
}
