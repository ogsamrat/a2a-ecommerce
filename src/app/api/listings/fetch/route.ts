import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import {
  getIndexer,
  getNetworkMode,
  type NetworkMode,
} from "@/lib/blockchain/algorand";
import type { OnChainListing } from "@/lib/agents/types";
import {
  getRememberedListings,
  rememberListings,
} from "@/lib/listings/registry";

function getQueryTimeoutMs(network: NetworkMode): number {
  const raw = process.env.INDEXER_QUERY_TIMEOUT_MS;
  const parsed = Number(raw ?? "");
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return network === "testnet" ? 9000 : 2500;
}

function normalizeType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
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

async function withTimeoutRetry<T>(
  queryFactory: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  try {
    return await withTimeout(queryFactory(), timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("timeout")) throw error;

    const retryTimeoutMs = Math.min(timeoutMs * 2, 20000);
    return await withTimeout(queryFactory(), retryTimeoutMs);
  }
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

function filterLocalListings(
  listings: OnChainListing[],
  serviceType: string | undefined,
  maxBudget: number,
  sellerAddress: string | undefined,
): OnChainListing[] {
  return listings.filter((listing) => {
    if (sellerAddress && listing.seller !== sellerAddress) return false;
    if (
      serviceType &&
      normalizeType(String(listing.type ?? "unknown")) !== serviceType
    ) {
      return false;
    }
    return Number(listing.price) <= maxBudget;
  });
}

function mergeListings(
  primary: OnChainListing[],
  fallback: OnChainListing[],
): OnChainListing[] {
  const byId = new Map<string, OnChainListing>();
  for (const item of fallback) {
    if (!item.txId) continue;
    byId.set(item.txId, item);
  }
  for (const item of primary) {
    if (!item.txId) continue;
    byId.set(item.txId, item);
  }
  return [...byId.values()].sort((a, b) => {
    if (b.round !== a.round) return b.round - a.round;
    return b.timestamp - a.timestamp;
  });
}

export async function GET(req: NextRequest) {
  try {
    const rawType = req.nextUrl.searchParams.get("type") ?? "";
    const serviceType = rawType ? normalizeType(rawType) : undefined;
    const maxBudgetRaw = req.nextUrl.searchParams.get("maxBudget") ?? "999999";
    const maxBudget = Number(maxBudgetRaw);
    const sellerAddress = req.nextUrl.searchParams.get("seller") ?? undefined;

    if (!Number.isFinite(maxBudget) || maxBudget < 0) {
      return NextResponse.json(
        { error: "maxBudget must be a positive number" },
        { status: 400 },
      );
    }

    const network = getNetworkMode();
    const queryTimeoutMs = getQueryTimeoutMs(network);
    const remembered = await getRememberedListings();
    const rememberedFiltered = filterLocalListings(
      remembered,
      serviceType,
      maxBudget,
      sellerAddress,
    );

    if (network === "localnet") {
      const reachable = await isLocalIndexerReachable();
      if (!reachable) {
        return NextResponse.json({
          listings: rememberedFiltered,
          count: rememberedFiltered.length,
          network,
          source: "memory",
          warning:
            "Local indexer is not reachable on http://localhost:8980. Showing remembered listings only.",
        });
      }
    }

    const indexer = getIndexer();

    const listings: OnChainListing[] = [];
    const notePrefix = Buffer.from("a2a-listing:").toString("base64");
    const searchAddresses = sellerAddress ? [sellerAddress] : [];

    const allTxns: Array<{
      id?: string;
      sender?: string;
      note?: unknown;
      confirmedRound?: number | bigint;
    }> = [];

    if (searchAddresses.length > 0) {
      let hadAddressQueryTimeout = false;
      for (const address of searchAddresses) {
        try {
          const searchResult = await withTimeoutRetry(
            () =>
              indexer
                .searchForTransactions()
                .address(address)
                .notePrefix(notePrefix)
                .txType("pay")
                .limit(100)
                .do(),
            queryTimeoutMs,
          );
          allTxns.push(...(searchResult.transactions ?? []));
        } catch (error) {
          const message =
            error instanceof Error ? error.message.toLowerCase() : "";
          if (message.includes("timeout")) {
            hadAddressQueryTimeout = true;
          }
          // skip noisy address query failures and continue with remaining addresses
        }
      }

      if (!allTxns.length && hadAddressQueryTimeout) {
        const merged = mergeListings([], rememberedFiltered);
        return NextResponse.json({
          listings: merged,
          count: merged.length,
          network,
          source: "memory",
          warning:
            "Indexer query timed out while loading seller listings; showing remembered listings.",
        });
      }
    } else {
      try {
        let currentRound = 0;
        try {
          const health = await withTimeoutRetry(
            () => indexer.makeHealthCheck().do(),
            2000,
          );
          currentRound = Number(health.round ?? 0);
        } catch {}

        const searchResult = await withTimeoutRetry(() => {
          let req = indexer
            .searchForTransactions()
            .notePrefix(notePrefix)
            .txType("pay")
            .limit(250);
          if (currentRound > 0)
            req = req.minRound(Math.max(0, currentRound - 500000));
          return req.do();
        }, queryTimeoutMs);
        allTxns.push(...(searchResult.transactions ?? []));
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        if (
          message.includes("statement timeout") ||
          message.includes("searching for transaction") ||
          message.includes("timeout")
        ) {
          const merged = mergeListings([], rememberedFiltered);
          return NextResponse.json({
            listings: merged,
            count: merged.length,
            network,
            source: "memory",
            warning: "Indexer query timed out; showing remembered listings.",
          });
        }
        throw error;
      }
    }

    const seen = new Set<string>();
    const txns = allTxns.filter((txn) => {
      const id = txn.id ?? "";
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    for (const txn of txns) {
      try {
        const noteRaw = txn.note;
        if (!noteRaw) continue;
        const noteStr =
          typeof noteRaw === "string"
            ? Buffer.from(noteRaw, "base64").toString("utf-8")
            : new TextDecoder().decode(noteRaw as Uint8Array);

        if (!noteStr.startsWith("a2a-listing:")) continue;
        const data = JSON.parse(noteStr.slice("a2a-listing:".length));

        try {
          algosdk.Address.fromString(String(data.seller));
        } catch {
          continue;
        }

        const listing: OnChainListing = {
          txId: txn.id ?? "",
          sender: txn.sender ?? "",
          type: data.type,
          service: data.service,
          price: data.price,
          seller: data.seller,
          description: data.description,
          timestamp: data.timestamp ?? 0,
          zkCommitment: data.zkCommitment,
          round: Number(txn.confirmedRound ?? 0),
        };

        if (serviceType && normalizeType(String(listing.type)) !== serviceType)
          continue;
        if (listing.price > maxBudget) continue;

        listings.push(listing);
      } catch {
        // skip malformed
      }
    }

    await rememberListings(listings);
    const merged = mergeListings(listings, rememberedFiltered);

    return NextResponse.json({
      listings: merged,
      count: merged.length,
      network,
      source: "onchain+memory",
    });
  } catch (error) {
    const network = getNetworkMode();
    const fallbackTypeRaw = req.nextUrl.searchParams.get("type") ?? "";
    const fallbackServiceType = fallbackTypeRaw
      ? normalizeType(fallbackTypeRaw)
      : undefined;
    const fallbackMaxBudgetRaw = req.nextUrl.searchParams.get("maxBudget");
    const fallbackMaxBudget = Number(fallbackMaxBudgetRaw ?? "999999");
    const safeMaxBudget =
      Number.isFinite(fallbackMaxBudget) && fallbackMaxBudget >= 0
        ? fallbackMaxBudget
        : Number.MAX_SAFE_INTEGER;
    const fallbackSeller = req.nextUrl.searchParams.get("seller") ?? undefined;
    const remembered = await getRememberedListings();
    const filtered = filterLocalListings(
      remembered,
      fallbackServiceType,
      safeMaxBudget,
      fallbackSeller,
    );
    const msg =
      error instanceof Error ? error.message : "Failed to fetch listings";
    return NextResponse.json({
      listings: filtered,
      count: filtered.length,
      network,
      source: "memory",
      warning: `Listing fetch degraded: ${msg}`,
    });
  }
}
