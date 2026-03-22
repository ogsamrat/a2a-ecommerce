import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";
import { getDelivery } from "@/lib/delivery/registry";
import { getFeedbackForOrder } from "@/lib/feedback/ledger";
import { getHeldPayment } from "@/lib/blockchain/vault";
import { fetchListingByTxId } from "@/lib/blockchain/listings";
import type { OnChainListing, OrderRecord } from "@/lib/agents/types";

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

function normalizeType(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-") || "unknown"
  );
}

function parseOrderNote(
  noteStr: string,
): Omit<OrderRecord, "orderTxId" | "confirmedRound"> | null {
  if (!noteStr.startsWith("a2a-order:")) return null;
  try {
    const dataUnknown: unknown = JSON.parse(noteStr.slice("a2a-order:".length));
    const data =
      typeof dataUnknown === "object" && dataUnknown !== null
        ? (dataUnknown as Record<string, unknown>)
        : {};
    return {
      listingTxId: String(data.listingTxId ?? ""),
      buyer: String(data.buyer ?? ""),
      seller: String(data.seller ?? ""),
      type: normalizeType(String(data.type ?? "unknown")),
      service: String(data.service ?? "Unnamed Service"),
      price: Number(data.price ?? 0),
      description: String(data.description ?? ""),
      deliveryKind: data.deliveryKind as OnChainListing["deliveryKind"],
      accessDurationDays:
        data.accessDurationDays !== undefined &&
        Number.isFinite(Number(data.accessDurationDays))
          ? Number(data.accessDurationDays)
          : undefined,
      createdAt: Number(data.createdAt ?? 0) || Date.now(),
    };
  } catch {
    return null;
  }
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
    const network = getNetworkMode();
    const lookup = await indexer.lookupTransactionByID(orderTxId).do();
    const txn = (
      lookup as {
        transaction?: { note?: unknown; confirmedRound?: number | bigint };
      }
    ).transaction;
    const noteStr = decodeNote(txn?.note);
    const parsed = parseOrderNote(noteStr);
    if (!parsed) {
      return NextResponse.json(
        { error: "Order note not found" },
        { status: 404 },
      );
    }
    if (parsed.buyer !== buyer) {
      return NextResponse.json(
        { error: "Order does not belong to buyer" },
        { status: 403 },
      );
    }

    const listing =
      parsed.type === "unknown" && parsed.listingTxId
        ? await fetchListingByTxId(parsed.listingTxId).catch(() => null)
        : null;

    const order: OrderRecord = {
      orderTxId,
      listingTxId: parsed.listingTxId,
      buyer: parsed.buyer,
      seller: parsed.seller,
      type:
        parsed.type === "unknown"
          ? (listing?.type ?? "digital-access")
          : parsed.type,
      service:
        parsed.service && parsed.service !== "Unnamed Service"
          ? parsed.service
          : (listing?.service ?? parsed.service),
      price: parsed.price,
      description: parsed.description || listing?.description || "",
      deliveryKind: parsed.deliveryKind ?? listing?.deliveryKind,
      accessDurationDays:
        parsed.accessDurationDays ?? listing?.accessDurationDays,
      createdAt: parsed.createdAt,
      confirmedRound: Number(txn?.confirmedRound ?? 0),
    };

    const delivery = await getDelivery(orderTxId);
    const feedback = await getFeedbackForOrder(orderTxId);
    const held = await getHeldPayment(orderTxId);

    return NextResponse.json({
      order,
      delivery,
      deliveryProofExplorerUrl:
        network === "testnet" && delivery?.proofTxId
          ? `https://testnet.explorer.perawallet.app/tx/${delivery.proofTxId}`
          : null,
      feedback,
      paymentStatus: held?.status === "held" ? "held" : "released",
      heldAmountAlgo: held?.status === "held" ? held.amountAlgo : null,
      network,
      explorerUrl:
        network === "testnet"
          ? `https://testnet.explorer.perawallet.app/tx/${orderTxId}`
          : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
