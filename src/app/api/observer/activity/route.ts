import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";

const QUERY_TIMEOUT_MS = 2200;

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

function observerActivityFallback(
  network: string,
  warning: string,
  limit: number,
) {
  return NextResponse.json({
    network,
    observedAt: new Date().toISOString(),
    activities: [],
    count: 0,
    limit,
    warning,
  });
}

export async function GET(req: NextRequest) {
  try {
    const network = getNetworkMode();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const limit = Math.max(
      1,
      Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 20),
    );

    if (network === "localnet") {
      const reachable = await isLocalIndexerReachable();
      if (!reachable) {
        return observerActivityFallback(
          network,
          "Local indexer is not reachable on http://localhost:8980. Start localnet or set ALGORAND_NETWORK=testnet.",
          limit,
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
          .limit(100);
        if (currentRound > 0)
          req = req.minRound(Math.max(0, currentRound - 500000));
        return req.do();
      })(),
      QUERY_TIMEOUT_MS,
    );

    const seen = new Set<string>();
    const activities: Array<{
      txId: string;
      seller: string;
      service: string;
      type: string;
      price: number;
      round: number;
      timestamp: number;
      zkVerified: boolean;
    }> = [];

    for (const txn of searchResult.transactions ?? []) {
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

        activities.push({
          txId,
          seller,
          service: String(data.service ?? "Unnamed Service"),
          type: normalizeType(String(data.type ?? "unknown")),
          price: Number(data.price ?? 0),
          round: Number(txn.confirmedRound ?? 0),
          timestamp: Number(data.timestamp ?? 0),
          zkVerified: Boolean(data.zkCommitment),
        });
      } catch {
        // skip malformed records
      }
    }

    activities.sort((a, b) => {
      if (b.round !== a.round) return b.round - a.round;
      return b.timestamp - a.timestamp;
    });

    return NextResponse.json({
      network,
      observedAt: new Date().toISOString(),
      activities: activities.slice(0, limit),
      count: activities.length,
      limit,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Observer activity failed";
    const network = getNetworkMode();
    return observerActivityFallback(
      network,
      `Observer activity unavailable: ${msg}`,
      20,
    );
  }
}
