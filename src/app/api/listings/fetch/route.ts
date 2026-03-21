import { NextRequest, NextResponse } from "next/server";
import { getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";
import type { OnChainListing } from "@/lib/agents/types";

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
    const indexer = getIndexer();

    const listings: OnChainListing[] = [];
    const notePrefix = Buffer.from("a2a-listing:").toString("base64");

    let query = indexer
      .searchForTransactions()
      .notePrefix(notePrefix)
      .txType("pay");

    if (sellerAddress) {
      query = query.address(sellerAddress);
    }

    const searchResult = await query.limit(50).do();
    const txns = searchResult.transactions ?? [];

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

    return NextResponse.json({
      listings,
      count: listings.length,
      network,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch listings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
