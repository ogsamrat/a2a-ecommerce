import type { OnChainListing, X402Message } from "@/lib/agents/types";
import { createX402Message } from "@/lib/a2a/messaging";
import { generateNegotiationResponse } from "@/lib/ai/groq";

const STRATEGIES: Record<string, { concession: number; minDiscount: number }> =
  {
    cloudmax: { concession: 0.08, minDiscount: 0.25 },
    datavault: { concession: 0.12, minDiscount: 0.18 },
    quickapi: { concession: 0.18, minDiscount: 0.3 },
    bharatcompute: { concession: 0.1, minDiscount: 0.2 },
    securehost: { concession: 0.15, minDiscount: 0.28 },
  };

export async function sellerRespond(
  listing: OnChainListing,
  buyerOffer: number,
  round: number,
  buyerAgentId: string,
): Promise<{ message: X402Message; counterPrice: number; accepted: boolean }> {
  const strategy = STRATEGIES[listing.seller] ?? {
    concession: 0.12,
    minDiscount: 0.2,
  };
  const minPrice = Number(
    (listing.price * (1 - strategy.minDiscount)).toFixed(3),
  );
  const concessionPerRound =
    (listing.price - minPrice) * strategy.concession * round;
  let counterPrice = Math.max(
    minPrice,
    Number((listing.price - concessionPerRound).toFixed(3)),
  );

  let accepted = false;

  if (buyerOffer >= counterPrice) {
    counterPrice = buyerOffer;
    accepted = true;
  }

  if (
    Math.abs(buyerOffer - counterPrice) <= counterPrice * 0.05 &&
    buyerOffer >= minPrice
  ) {
    counterPrice = Number(((buyerOffer + counterPrice) / 2).toFixed(3));
    accepted = true;
  }

  const responseText = await generateNegotiationResponse(
    listing.seller,
    accepted ? "accepting" : "countering",
    buyerOffer,
    minPrice,
    listing.price,
    counterPrice,
    round,
    accepted,
  );

  const message = createX402Message(
    listing.seller,
    buyerAgentId,
    accepted ? "accept" : "counter",
    listing.txId,
    listing.service,
    counterPrice,
    responseText,
    round,
  );

  return { message, counterPrice, accepted };
}
