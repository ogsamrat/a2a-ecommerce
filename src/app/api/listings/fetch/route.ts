import { NextRequest, NextResponse } from "next/server";
import {
  getIndexer,
  getNetworkMode,
  getStoredAccounts,
} from "@/lib/blockchain/algorand";
import { getSeedListings } from "@/lib/blockchain/listings";
import type { OnChainListing } from "@/lib/agents/types";

const QUERY_TIMEOUT_MS = 1800;

function applyFilters(
  listings: OnChainListing[],
  serviceType?: string,
  maxBudget = Number.POSITIVE_INFINITY,
): OnChainListing[] {
  return listings.filter((listing) => {
    if (serviceType && listing.type !== serviceType) return false;
    if (listing.price > maxBudget) return false;
    return true;
  });
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

export async function GET(req: NextRequest) {
  try {
    const serviceType = req.nextUrl.searchParams.get("type") ?? undefined;
    const maxBudgetRaw = req.nextUrl.searchParams.get("maxBudget") ?? "999999";
    const maxBudget = Number(maxBudgetRaw);
    const sellerAddress = req.nextUrl.searchParams.get("seller") ?? undefined;

    if (!Number.isFinite(maxBudget) || maxBudget < 0) {
      return NextResponse.json(
        { error: "maxBudget must be a positive number" },
        { status: 400 },
      );
    }

    if (
      serviceType &&
      !["cloud-storage", "api-access", "compute", "hosting"].includes(
        serviceType,
      )
    ) {
      return NextResponse.json(
        { error: "Unsupported service type" },
        { status: 400 },
      );
    }

    const network = getNetworkMode();

    if (network === "localnet") {
      const reachable = await isLocalIndexerReachable();
      if (!reachable) {
        return NextResponse.json({
          listings: [],
          count: 0,
          network,
          warning:
            "Local indexer is not reachable on http://localhost:8980. Start localnet or set ALGORAND_NETWORK=testnet.",
        });
      }
    }

    const indexer = getIndexer();

    const listings: OnChainListing[] = [];
    const notePrefix = Buffer.from("a2a-listing:").toString("base64");
    const accountState = getStoredAccounts();

    if (!sellerAddress && !accountState) {
      const demoListings = applyFilters(
        getSeedListings(),
        serviceType,
        maxBudget,
      );
      return NextResponse.json({
        listings: demoListings,
        count: demoListings.length,
        network,
        source: "demo",
      });
    }

    const searchAddresses = sellerAddress
      ? [sellerAddress]
      : Object.values(accountState?.sellerAddrs ?? {});

    const allTxns: Array<{
      id?: string;
      sender?: string;
      note?: unknown;
      confirmedRound?: number;
    }> = [];

    if (searchAddresses.length > 0) {
      for (const address of searchAddresses) {
        try {
          const searchResult = await withTimeout(
            indexer
              .searchForTransactions()
              .address(address)
              .notePrefix(notePrefix)
              .txType("pay")
              .limit(20)
              .do(),
            QUERY_TIMEOUT_MS,
          );
          allTxns.push(...(searchResult.transactions ?? []));
        } catch {
          // skip noisy address query failures and continue with remaining addresses
        }
      }
    } else {
      try {
        const searchResult = await withTimeout(
          indexer
            .searchForTransactions()
            .notePrefix(notePrefix)
            .txType("pay")
            .limit(25)
            .do(),
          QUERY_TIMEOUT_MS,
        );
        allTxns.push(...(searchResult.transactions ?? []));
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        if (
          message.includes("statement timeout") ||
          message.includes("searching for transaction") ||
          message.includes("timeout")
        ) {
          const demoListings = applyFilters(
            getSeedListings(),
            serviceType,
            maxBudget,
          );
          return NextResponse.json({
            listings: demoListings,
            count: demoListings.length,
            network,
            source: "demo",
            warning:
              "Indexer query timed out; showing demo marketplace listings.",
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

        if (serviceType && listing.type !== serviceType) continue;
        if (listing.price > maxBudget) continue;

        listings.push(listing);
      } catch {
        // skip malformed
      }
    }

    const finalListings = listings.length
      ? listings
      : !sellerAddress
        ? applyFilters(getSeedListings(), serviceType, maxBudget)
        : [];

    return NextResponse.json({
      listings: finalListings,
      count: finalListings.length,
      network,
      source: listings.length ? "onchain" : "demo",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch listings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
