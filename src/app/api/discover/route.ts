import { NextRequest, NextResponse } from "next/server";
import {
  fetchListingsFromChain,
  filterListings,
} from "@/lib/blockchain/listings";
import { createAction } from "@/lib/a2a/messaging";
import type { ParsedIntent } from "@/lib/agents/types";

export async function POST(req: NextRequest) {
  try {
    const { intent } = (await req.json()) as { intent: ParsedIntent };
    if (!intent?.serviceType) {
      return NextResponse.json(
        { error: "Intent is required" },
        { status: 400 },
      );
    }

    const actions = [
      createAction(
        "buyer",
        "Buyer Agent",
        "discovery",
        `Querying Algorand Indexer for on-chain listings matching "${intent.serviceType}"...`,
      ),
    ];

    let allListings = [];
    try {
      allListings = await fetchListingsFromChain();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Indexer query failed";
      actions.push(
        createAction(
          "system",
          "Indexer",
          "result",
          `Discovery warning: ${msg}. No fallback listings are used.`,
        ),
      );
      return NextResponse.json({ listings: [], allCount: 0, actions });
    }
    actions.push(
      createAction(
        "system",
        "Indexer",
        "discovery",
        `Found **${allListings.length} total listing(s)** on-chain.`,
      ),
    );

    const filtered = filterListings(
      allListings,
      intent.serviceType,
      intent.maxBudget,
    );

    if (filtered.length === 0) {
      actions.push(
        createAction(
          "buyer",
          "Buyer Agent",
          "result",
          `No on-chain listings match "${intent.serviceType}" within ${intent.maxBudget} ALGO. Try a broader search or higher budget.`,
        ),
      );
      return NextResponse.json({
        listings: [],
        allCount: allListings.length,
        actions,
      });
    }

    const listingSummary = filtered
      .map(
        (l) =>
          `• **${l.seller}** — "${l.service}" at **${l.price} ALGO** (TX: \`${l.txId.slice(0, 16)}...\`, Round: ${l.round})${l.zkCommitment ? " [ZK ✓]" : ""}`,
      )
      .join("\n");

    actions.push(
      createAction(
        "buyer",
        "Buyer Agent",
        "discovery",
        `**${filtered.length}** matching on-chain listing(s):\n\n${listingSummary}`,
        { listings: filtered },
      ),
    );

    return NextResponse.json({
      listings: filtered,
      allCount: allListings.length,
      actions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Discovery failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
