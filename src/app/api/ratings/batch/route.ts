import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getSellerRating, getListingRating } from "@/lib/feedback/ledger";

export async function POST(req: NextRequest) {
  try {
    const { sellers, listings } = (await req.json()) as {
      sellers?: string[];
      listings?: string[];
    };

    const sellerIds = Array.isArray(sellers)
      ? [...new Set(sellers.map((s) => String(s).trim()).filter(Boolean))]
      : [];
    const listingIds = Array.isArray(listings)
      ? [...new Set(listings.map((s) => String(s).trim()).filter(Boolean))]
      : [];

    const sellerResults: Record<string, { score: number; count: number }> = {};
    const listingResults: Record<string, { score: number; count: number }> = {};

    for (const seller of sellerIds) {
      try {
        algosdk.Address.fromString(seller);
      } catch {
        continue;
      }
      sellerResults[seller] = await getSellerRating(seller);
    }

    for (const listingTxId of listingIds) {
      listingResults[listingTxId] = await getListingRating(listingTxId);
    }

    return NextResponse.json({
      sellers: sellerResults,
      listings: listingResults,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
