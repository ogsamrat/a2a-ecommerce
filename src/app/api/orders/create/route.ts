import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";
import { rememberOrder } from "@/lib/orders/registry";
import type { OrderRecord, OnChainListing } from "@/lib/agents/types";

type DeliveryKind = NonNullable<OnChainListing["deliveryKind"]>;

function normalizeType(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return normalized || "unknown";
}

function normalizeDeliveryKind(value: unknown): DeliveryKind {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    raw === "credentials" ||
    raw === "api_key" ||
    raw === "instructions" ||
    raw === "invite_link" ||
    raw === "provisioned" ||
    raw === "other"
  ) {
    return raw;
  }
  return "other";
}

export async function POST(req: NextRequest) {
  try {
    const {
      buyerAddress,
      sellerAddress,
      listingTxId,
      type,
      service,
      price,
      description,
      deliveryKind,
      accessDurationDays,
    } = (await req.json()) as {
      buyerAddress?: string;
      sellerAddress?: string;
      listingTxId?: string;
      type?: string;
      service?: string;
      price?: number;
      description?: string;
      deliveryKind?: string;
      accessDurationDays?: number;
    };

    if (!buyerAddress || !sellerAddress || !listingTxId) {
      return NextResponse.json(
        { error: "buyerAddress, sellerAddress, listingTxId required" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(buyerAddress);
      algosdk.Address.fromString(sellerAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid buyerAddress or sellerAddress" },
        { status: 400 },
      );
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.json(
        { error: "price must be a positive number" },
        { status: 400 },
      );
    }

    const orderData = {
      v: 1,
      listingTxId: String(listingTxId),
      buyer: String(buyerAddress),
      seller: String(sellerAddress),
      type: normalizeType(type),
      service: String(service ?? "Unnamed Service"),
      price: parsedPrice,
      description: String(description ?? ""),
      deliveryKind: normalizeDeliveryKind(deliveryKind),
      accessDurationDays:
        accessDurationDays !== undefined &&
        Number.isFinite(Number(accessDurationDays)) &&
        Number(accessDurationDays) >= 0
          ? Number(accessDurationDays)
          : undefined,
      createdAt: Date.now(),
    };

    const noteStr = "a2a-order:" + JSON.stringify(orderData);

    const algorand = getClient();
    const algod = algorand.client.algod;
    const params = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.Address.fromString(buyerAddress),
      receiver: algosdk.Address.fromString(sellerAddress),
      amount: algosdk.algosToMicroalgos(parsedPrice),
      note: new TextEncoder().encode(noteStr),
      suggestedParams: params,
    });

    const unsignedTxnB64 = Buffer.from(
      algosdk.encodeUnsignedTransaction(txn),
    ).toString("base64");

    const record: OrderRecord = {
      orderTxId: txn.txID(),
      listingTxId: orderData.listingTxId,
      buyer: orderData.buyer,
      seller: orderData.seller,
      type: orderData.type,
      service: orderData.service,
      price: orderData.price,
      description: orderData.description,
      deliveryKind: orderData.deliveryKind,
      accessDurationDays: orderData.accessDurationDays,
      createdAt: orderData.createdAt,
      confirmedRound: 0,
    };
    await rememberOrder(record);

    return NextResponse.json({
      unsignedTxn: unsignedTxnB64,
      txnId: txn.txID(),
      order: record,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to build order txn";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
