import { NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";

const QUERY_TIMEOUT_MS = 2200;

interface ListingRecord {
  type: string;
  price: number;
  seller: string;
  zkCommitment?: string;
  round: number;
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

async function isLocalIndexerReachable(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8980/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function observerSummaryFallback(network: string, warning: string) {
  return NextResponse.json({
    network,
    observedAt: new Date().toISOString(),
    listingsCount: 0,
    uniqueSellers: 0,
    avgPrice: 0,
    zkCoveragePct: 0,
    latestRound: 0,
    typeBreakdown: [],
    warning,
  });
}

export async function GET() {
  try {
    const network = getNetworkMode();
    if (network === "localnet") {
      const reachable = await isLocalIndexerReachable();
      if (!reachable) {
        return observerSummaryFallback(
          network,
          "Local indexer is not reachable on http://localhost:8980. Start localnet or set ALGORAND_NETWORK=testnet.",
        );
      }
    }

    const indexer = getIndexer();
    const notePrefix = Buffer.from("a2a-listing:").toString("base64");

    let currentRound = 0;
    try {
      const health = await withTimeout(indexer.makeHealthCheck().do(), 2000);
      currentRound = Number(health.round ?? 0);
    } catch {}

    const searchResult = await withTimeout(
      (() => {
        let req = indexer
          .searchForTransactions()
          .notePrefix(notePrefix)
          .txType("pay")
          .limit(250);
        if (currentRound > 0)
          req = req.minRound(Math.max(0, currentRound - 500000));
        return req.do();
      })(),
      QUERY_TIMEOUT_MS,
    );

    const txns = searchResult.transactions ?? [];
    const seen = new Set<string>();
    const listings: ListingRecord[] = [];

    for (const txn of txns) {
      try {
        const txId = txn.id ?? "";
        if (!txId || seen.has(txId)) continue;
        seen.add(txId);

        const noteRaw = txn.note;
        if (!noteRaw) continue;

        const noteStr =
          typeof noteRaw === "string"
            ? Buffer.from(noteRaw, "base64").toString("utf-8")
            : new TextDecoder().decode(noteRaw as Uint8Array);

        if (!noteStr.startsWith("a2a-listing:")) continue;
        const data = JSON.parse(noteStr.slice("a2a-listing:".length));

        const seller = String(data.seller ?? "");
        try {
          algosdk.Address.fromString(seller);
        } catch {
          continue;
        }

        listings.push({
          type: normalizeType(String(data.type ?? "unknown")),
          price: Number(data.price ?? 0),
          seller,
          zkCommitment:
            typeof data.zkCommitment === "string"
              ? data.zkCommitment
              : undefined,
          round: Number(txn.confirmedRound ?? 0),
        });
      } catch {
        // skip malformed records
      }
    }

    const listingsCount = listings.length;
    const uniqueSellers = new Set(listings.map((l) => l.seller)).size;
    const avgPrice =
      listingsCount > 0
        ? Number(
            (
              listings.reduce((sum, l) => sum + l.price, 0) / listingsCount
            ).toFixed(4),
          )
        : 0;
    const zkCount = listings.filter((l) => Boolean(l.zkCommitment)).length;
    const zkCoveragePct =
      listingsCount > 0 ? Math.round((zkCount * 100) / listingsCount) : 0;
    const latestRound = listings.reduce((max, l) => Math.max(max, l.round), 0);

    const typeMap = new Map<string, { count: number; total: number }>();
    for (const listing of listings) {
      const entry = typeMap.get(listing.type) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += listing.price;
      typeMap.set(listing.type, entry);
    }

    const typeBreakdown = [...typeMap.entries()]
      .map(([type, val]) => ({
        type,
        count: val.count,
        avgPrice: Number((val.total / val.count).toFixed(4)),
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      network,
      observedAt: new Date().toISOString(),
      listingsCount,
      uniqueSellers,
      avgPrice,
      zkCoveragePct,
      latestRound,
      typeBreakdown,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Observer summary failed";
    const network = getNetworkMode();
    return observerSummaryFallback(
      network,
      `Observer summary unavailable: ${msg}`,
    );
  }
}
