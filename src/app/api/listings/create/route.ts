import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { createHash, randomBytes } from "crypto";
import { getClient } from "@/lib/blockchain/algorand";
import { rememberListing } from "@/lib/listings/registry";

function normalizeType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function normalizeDeliveryKind(
  value: unknown,
):
  | "credentials"
  | "api_key"
  | "instructions"
  | "invite_link"
  | "provisioned"
  | "other"
  | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
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
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const {
      senderAddress,
      type,
      service,
      price,
      description,
      deliveryKind,
      accessDurationDays,
    } = await req.json();

    const parsedPrice = Number(price);
    const normalizedType = normalizeType(type);

    if (!senderAddress || !service || !description) {
      return NextResponse.json(
        { error: "senderAddress, service, description required" },
        { status: 400 },
      );
    }

    if (!normalizedType) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.json(
        { error: "price must be a positive number" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(senderAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid senderAddress" },
        { status: 400 },
      );
    }

    const secret = randomBytes(32).toString("hex");
    const preimage = `${secret}|${senderAddress}|${parsedPrice}|${description ?? ""}`;
    const commitment = createHash("sha256").update(preimage).digest("hex");

    const noteData = {
      type: normalizedType,
      service,
      price: parsedPrice,
      seller: senderAddress,
      description: description ?? "",
      timestamp: Date.now(),
      zkCommitment: commitment,
      deliveryKind: normalizeDeliveryKind(deliveryKind),
      accessDurationDays:
        accessDurationDays !== undefined &&
        Number.isFinite(Number(accessDurationDays)) &&
        Number(accessDurationDays) >= 0
          ? Number(accessDurationDays)
          : undefined,
    };
    const noteStr = "a2a-listing:" + JSON.stringify(noteData);

    const algorand = getClient();
    const algod = algorand.client.algod;
    const params = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.Address.fromString(senderAddress),
      receiver: algosdk.Address.fromString(senderAddress),
      amount: 0,
      note: new TextEncoder().encode(noteStr),
      suggestedParams: params,
    });

    const unsignedTxnB64 = Buffer.from(
      algosdk.encodeUnsignedTransaction(txn),
    ).toString("base64");

    await rememberListing({
      txId: txn.txID(),
      sender: senderAddress,
      type: normalizedType,
      service,
      price: parsedPrice,
      seller: senderAddress,
      description: String(description ?? ""),
      timestamp: Number(noteData.timestamp ?? Date.now()),
      zkCommitment: commitment,
      deliveryKind: noteData.deliveryKind,
      accessDurationDays: noteData.accessDurationDays,
      round: 0,
    });

    return NextResponse.json({
      unsignedTxn: unsignedTxnB64,
      txnId: txn.txID(),
      zkSecret: secret,
      zkCommitment: commitment,
      listing: noteData,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to build listing txn";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
