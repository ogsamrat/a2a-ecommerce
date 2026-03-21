import type {
  OnChainListing,
  X402Message,
  NegotiationSession,
  ParsedIntent,
} from "@/lib/agents/types";
import { parseUserIntent } from "@/lib/ai/groq";
import { createX402Message } from "@/lib/a2a/messaging";
import { filterListings } from "@/lib/blockchain/listings";

const BUYER_ID = "buyer-agent";

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  return parseUserIntent(userMessage);
}

export function discoverFromListings(
  listings: OnChainListing[],
  intent: ParsedIntent,
): OnChainListing[] {
  return filterListings(listings, intent.serviceType, intent.maxBudget);
}

export function createOffer(
  listing: OnChainListing,
  intent: ParsedIntent,
): { message: X402Message; offerPrice: number } {
  const targetRatio = 0.65;
  let offerPrice = Math.max(
    Number((listing.price * (1 - 0.35)).toFixed(3)),
    Number(
      Math.min(listing.price * targetRatio, intent.maxBudget * 0.7).toFixed(3),
    ),
  );

  if (offerPrice <= 0) {
    offerPrice = Number((listing.price * targetRatio).toFixed(3));
    if (offerPrice <= 0) offerPrice = 0.001;
  }

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
  const gap = lastSellerPrice - Number((listing.price * 0.7).toFixed(3));
  const newOffer = Number(
    (lastSellerPrice - gap * 0.3 * (1 / round)).toFixed(3),
  );
  const clampedOffer = Math.max(
    newOffer,
    Number((listing.price * 0.72).toFixed(3)),
  );
  let finalOffer = Math.min(clampedOffer, intent.maxBudget);

  if (finalOffer <= 0) {
    finalOffer = Number((listing.price * 0.72).toFixed(3));
    if (finalOffer <= 0) finalOffer = 0.001;
  }

  const accepting =
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

export function selectBestDeal(
  sessions: NegotiationSession[],
): NegotiationSession | null {
  const accepted = sessions.filter((s) => s.accepted);
  if (accepted.length === 0) return null;

  // Choose best deal based on combination of lowest price and highest reputation
  // A seller with 100 reputation gets no penalty (1.0x price weight)
  // A seller with 0 reputation gets a 2.0x penalty on price for ranking purposes
  accepted.sort((a, b) => {
    const repA = a.sellerReputation ?? 50;
    const repB = b.sellerReputation ?? 50;

    const scoreA = a.finalPrice * (2 - repA / 100);
    const scoreB = b.finalPrice * (2 - repB / 100);

    return scoreA - scoreB;
  });

  return accepted[0];
}
