import { NextRequest, NextResponse } from "next/server";
import { runNegotiations } from "@/lib/negotiation/engine";
import { selectBestDeal } from "@/lib/agents/buyer-agent";
import { generateDealSummary } from "@/lib/ai/groq";
import { createAction } from "@/lib/a2a/messaging";
import type { ParsedIntent, OnChainListing } from "@/lib/agents/types";

export async function POST(req: NextRequest) {
  try {
    const { intent, listings } = (await req.json()) as {
      intent: ParsedIntent;
      listings: OnChainListing[];
    };

    if (!intent || !listings?.length) {
      return NextResponse.json(
        { error: "Intent and listings are required" },
        { status: 400 },
      );
    }

    const { sessions, actions } = await runNegotiations(listings, intent);
    const bestDeal = selectBestDeal(sessions);

    if (bestDeal) {
      const summary = await generateDealSummary(
        bestDeal.sellerName,
        bestDeal.service,
        bestDeal.finalPrice,
        bestDeal.originalPrice,
        bestDeal.rounds,
      );

      actions.push(
        createAction(
          "buyer",
          "Buyer Agent",
          "result",
          `**Best Deal Found!**\n\n${summary}\n\n` +
            `**Seller:** ${bestDeal.sellerName}\n` +
            `**Service:** ${bestDeal.service}\n` +
            `**Final Price:** ${bestDeal.finalPrice} ALGO\n` +
            `**Original:** ${bestDeal.originalPrice} ALGO\n` +
            `**Seller Reputation:** ${bestDeal.sellerReputation ?? 0}/100\n` +
            `**ZK Verified:** ${bestDeal.zkVerified ? "Yes" : "No"}\n` +
            `**On-Chain Listing TX:** \`${bestDeal.listingTxId.slice(0, 20)}...\``,
          { bestDeal },
        ),
      );
    } else {
      actions.push(
        createAction(
          "buyer",
          "Buyer Agent",
          "result",
          "No deals could be reached within your budget.",
        ),
      );
    }

    return NextResponse.json({ sessions, bestDeal, actions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Negotiation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
