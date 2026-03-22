import type {
  OnChainListing,
  X402Message,
  NegotiationSession,
  ParsedIntent,
} from "@/lib/agents/types";
import { createX402Message } from "@/lib/a2a/messaging";
import { filterListings } from "@/lib/blockchain/listings";

const BUYER_ID = "buyer-agent";

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  const { parseUserIntent } = await import("@/lib/ai/groq");
  return parseUserIntent(userMessage);
}

export function discoverFromListings(
  listings: OnChainListing[],
  intent: ParsedIntent,
): OnChainListing[] {
  return filterListings(
    listings,
    intent.serviceType,
    intent.maxBudget,
    intent.searchTerms,
  );
}

function round4(n: number): number {
  return Math.max(parseFloat(n.toFixed(4)), 0.0001);
}

export function createOffer(
  listing: OnChainListing,
  intent: ParsedIntent,
): { message: X402Message; offerPrice: number } {
  const targetRatio = 0.65;
  const offerPrice = round4(
    Math.min(listing.price * targetRatio, intent.maxBudget * 0.7),
  );

  const message = createX402Message(
    BUYER_ID,
    listing.seller,
    "offer",
    listing.txId,
    listing.service,
    offerPrice,
    `Offering ${offerPrice} ALGO for "${listing.service}". Looking for the best value within my budget.`,
    1,
  );

  return { message, offerPrice };
}

export function createCounterOffer(
  listing: OnChainListing,
  lastSellerPrice: number,
  intent: ParsedIntent,
  round: number,
): { message: X402Message; offerPrice: number; accepting: boolean } {
  const gap = lastSellerPrice - listing.price * 0.7;
  const newOffer = lastSellerPrice - gap * 0.3 * (1 / round);
  const clampedOffer = Math.max(newOffer, listing.price * 0.72);
  const finalOffer = round4(Math.min(clampedOffer, intent.maxBudget));

  const accepting =
    lastSellerPrice > 0 &&
    Math.abs(finalOffer - lastSellerPrice) <= lastSellerPrice * 0.05;
  const action: X402Message["action"] = accepting ? "accept" : "counter";

  const message = createX402Message(
    BUYER_ID,
    listing.seller,
    action,
    listing.txId,
    listing.service,
    accepting ? lastSellerPrice : finalOffer,
    accepting
      ? `Accepted! ${lastSellerPrice} ALGO for "${listing.service}" is a fair deal.`
      : `Counter-offering ${finalOffer} ALGO. That's a competitive price for this service.`,
    round,
  );

  return {
    message,
    offerPrice: accepting ? lastSellerPrice : finalOffer,
    accepting,
  };
}

/**
 * Composite deal score — higher is better.
 *
 * Formula:  60% weight on discount achieved  +  40% weight on seller reputation
 *
 * This means a seller with reputation 90 at 5% discount beats a seller with
 * reputation 40 at the same 5% discount. But a massive discount from a
 * low-reputation seller can still win if the price gap is large enough.
 */
export function computeDealScore(
  session: Omit<NegotiationSession, "dealScore">,
): number {
  const discountPct =
    session.originalPrice > 0
      ? (session.originalPrice - session.finalPrice) / session.originalPrice
      : 0;
  const reputationNorm = session.reputationScore / 100;
  return parseFloat((discountPct * 0.6 + reputationNorm * 0.4).toFixed(4));
}

export function selectBestDeal(
  sessions: NegotiationSession[],
): NegotiationSession | null {
  const accepted = sessions.filter((s) => s.accepted && s.finalPrice > 0);
  if (accepted.length === 0) return null;
  // Deterministic tie-breakers prevent run-to-run variance when scores match.
  accepted.sort((a, b) => {
    if (b.dealScore !== a.dealScore) return b.dealScore - a.dealScore;
    if (a.finalPrice !== b.finalPrice) return a.finalPrice - b.finalPrice;
    if (b.reputationScore !== a.reputationScore) {
      return b.reputationScore - a.reputationScore;
    }
    return a.listingTxId.localeCompare(b.listingTxId);
  });
  return accepted[0];
}
