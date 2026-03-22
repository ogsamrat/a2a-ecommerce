import { NextRequest, NextResponse } from "next/server";
import { getClient, getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";
import type { OnChainListing } from "@/lib/agents/types";

export async function GET(req: NextRequest) {
  try {
    const serviceType = req.nextUrl.searchParams.get("type") ?? undefined;
    const maxBudget = Number(req.nextUrl.searchParams.get("maxBudget") ?? "999999");
    const sellerAddress = req.nextUrl.searchParams.get("seller") ?? undefined;

    const network = getNetworkMode();
    const indexer = getIndexer();

    const listings: OnChainListing[] = [];
    const notePrefix = Buffer.from("a2a-listing:").toString("base64");

    // Limit search to recent blocks to avoid indexer SQL timeout on full-history scan
    let minRound = 0;
    try {
      const algod = getClient().client.algod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status: any = await algod.status().do();
      const currentRound = Number(status["last-round"] ?? status.lastRound ?? 0);
      // Search back ~50 000 rounds ≈ 2 days on TestNet
      minRound = Math.max(0, currentRound - 50_000);
    } catch { /* use 0 if algod unavailable */ }

    let query = indexer
      .searchForTransactions()
      .notePrefix(notePrefix)
      .minRound(minRound);

    if (sellerAddress) {
      query = query.address(sellerAddress);
    }

    const TIMEOUT_MS = 22000;
    let timedOut = false;
    const timeoutSentinel = { transactions: [], _timedOut: true };

    let timerHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
      timerHandle = setTimeout(() => {
        timedOut = true;
        resolve(timeoutSentinel);
      }, TIMEOUT_MS);
    });

    const searchResult = await Promise.race([
      query.limit(100).do()
        .finally(() => clearTimeout(timerHandle))
        .catch(() => timeoutSentinel),
      timeoutPromise,
    ]);

    if (timedOut) {
      return NextResponse.json(
        { listings: [], count: 0, network, warning: "Indexer query timed out — TestNet may be slow. Try again shortly." },
        { status: 200 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txns: any[] = (searchResult as { transactions?: unknown[] }).transactions ?? [];

    const PREFIX = "a2a-listing:";
    for (const txn of txns) {
      try {
        const noteRaw = txn.note;
        if (!noteRaw) continue;
        const noteStr = typeof noteRaw === "string"
          ? Buffer.from(noteRaw, "base64").toString("utf-8")
          : noteRaw instanceof Uint8Array
            ? new TextDecoder().decode(noteRaw)
            : null;

        if (!noteStr || !noteStr.startsWith(PREFIX)) continue;
        const data = JSON.parse(noteStr.slice(PREFIX.length));

        const listing: OnChainListing = {
          txId:        String(txn.id ?? txn.txId ?? ""),
          sender:      String(txn.sender ?? txn.from ?? ""),
          type:        data.type,
          service:     data.service,
          price:       data.price,
          seller:      data.seller,
          description: data.description,
          timestamp:   data.timestamp ?? 0,
          zkCommitment: data.zkCommitment,
          round: Number(txn["confirmed-round"] ?? txn.confirmedRound ?? 0),
        };

        if (serviceType && listing.type !== serviceType) continue;
        if (listing.price > maxBudget) continue;

        listings.push(listing);
      } catch {
        // skip malformed
      }
    }

    return NextResponse.json({
      listings,
      count: listings.length,
      network,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch listings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
