import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer } from "@/lib/blockchain/algorand";
import { getDelivery } from "@/lib/delivery/registry";

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

export async function GET(req: NextRequest) {
  try {
    const orderTxId = req.nextUrl.searchParams.get("orderTxId")?.trim() ?? "";
    const buyer = req.nextUrl.searchParams.get("buyer")?.trim() ?? "";
    if (!orderTxId || !buyer) {
      return NextResponse.json(
        { error: "orderTxId and buyer query params required" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(buyer);
    } catch {
      return NextResponse.json({ error: "Invalid buyer" }, { status: 400 });
    }

    const indexer = getIndexer();
    const lookup = await indexer.lookupTransactionByID(orderTxId).do();
    const txn = (lookup as { transaction?: { note?: unknown } }).transaction;
    const noteStr = decodeNote(txn?.note);
    if (!noteStr.startsWith("a2a-order:")) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const dataUnknown: unknown = JSON.parse(noteStr.slice("a2a-order:".length));
    const data =
      typeof dataUnknown === "object" && dataUnknown !== null
        ? (dataUnknown as { buyer?: unknown })
        : {};
    if (String(data.buyer ?? "") !== buyer) {
      return NextResponse.json(
        { error: "Order does not belong to buyer" },
        { status: 403 },
      );
    }

    const delivery = await getDelivery(orderTxId);
    if (!delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, delivery });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch delivery";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
