import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer } from "@/lib/blockchain/algorand";
import { submitFeedback, getEditWindowMs } from "@/lib/feedback/ledger";

function decodeNote(noteRaw: unknown): string {
  if (!noteRaw) return "";
  if (typeof noteRaw === "string") {
    try {
      return Buffer.from(noteRaw, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
  if (noteRaw instanceof Uint8Array) {
    return new TextDecoder().decode(noteRaw);
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const { buyerAddress, orderTxId, rating, comment } = (await req.json()) as {
      buyerAddress?: string;
      orderTxId?: string;
      rating?: number;
      comment?: string;
    };

    if (!buyerAddress || !orderTxId || rating === undefined) {
      return NextResponse.json(
        { error: "buyerAddress, orderTxId, rating required" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(buyerAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid buyerAddress" },
        { status: 400 },
      );
    }

    const indexer = getIndexer();
    const lookup = await indexer.lookupTransactionByID(orderTxId).do();
    const txn = (lookup as { transaction?: { note?: unknown } }).transaction;
    const noteStr = decodeNote(txn?.note);
    if (!noteStr.startsWith("a2a-order:")) {
      return NextResponse.json(
        { error: "Order note not found" },
        { status: 404 },
      );
    }
    const dataUnknown: unknown = JSON.parse(noteStr.slice("a2a-order:".length));
    const data =
      typeof dataUnknown === "object" && dataUnknown !== null
        ? (dataUnknown as Record<string, unknown>)
        : {};
    if (String(data.buyer ?? "") !== buyerAddress) {
      return NextResponse.json(
        { error: "Order does not belong to buyer" },
        { status: 403 },
      );
    }

    const result = await submitFeedback({
      orderTxId,
      listingTxId: String(data.listingTxId ?? ""),
      buyer: String(data.buyer ?? ""),
      seller: String(data.seller ?? ""),
      rating: Number(rating),
      comment,
    });

    return NextResponse.json({
      success: true,
      feedback: result.summary,
      editWindowMs: getEditWindowMs(),
      wasCreated: result.wasCreated,
      note: "Seller reputation on-chain cannot be undone; undo affects marketplace reputation only.",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to submit feedback";
    const isUserError =
      msg.includes("rating must") ||
      msg.includes("locked") ||
      msg.includes("Order note not found") ||
      msg.includes("Order does not belong to buyer");
    return NextResponse.json(
      { error: msg },
      { status: isUserError ? 400 : 500 },
    );
  }
}
