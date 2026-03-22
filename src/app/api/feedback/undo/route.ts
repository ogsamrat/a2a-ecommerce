import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { undoFeedback } from "@/lib/feedback/ledger";

export async function POST(req: NextRequest) {
  try {
    const { buyerAddress, orderTxId } = (await req.json()) as {
      buyerAddress?: string;
      orderTxId?: string;
    };

    if (!buyerAddress || !orderTxId) {
      return NextResponse.json(
        { error: "buyerAddress and orderTxId required" },
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

    const summary = await undoFeedback({ orderTxId, buyer: buyerAddress });
    return NextResponse.json({ success: true, feedback: summary });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to undo feedback";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
