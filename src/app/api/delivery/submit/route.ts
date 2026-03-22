import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer } from "@/lib/blockchain/algorand";
import { setDelivery } from "@/lib/delivery/registry";
import type {
  DeliveryRecord,
  OnChainListing,
  OrderRecord,
} from "@/lib/agents/types";

type DeliveryKind = NonNullable<OnChainListing["deliveryKind"]>;

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
      type: String(data.type ?? "unknown"),
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

async function assertHasDeliveryProof(
  sellerAddress: string,
  orderTxId: string,
): Promise<void> {
  const indexer = getIndexer();
  const notePrefix = Buffer.from("a2a-delivery-proof:").toString("base64");

  const search = await indexer
    .searchForTransactions()
    .address(sellerAddress)
    .notePrefix(notePrefix)
    .txType("pay")
    .limit(50)
    .do();

  for (const txn of (search.transactions ?? []) as Array<{
    note?: unknown;
    confirmedRound?: number | bigint;
  }>) {
    const noteStr = decodeNote(txn.note);
    if (!noteStr.startsWith("a2a-delivery-proof:")) continue;
    try {
      const dataUnknown: unknown = JSON.parse(
        noteStr.slice("a2a-delivery-proof:".length),
      );
      const data =
        typeof dataUnknown === "object" && dataUnknown !== null
          ? (dataUnknown as { orderTxId?: unknown })
          : {};
      if (String(data.orderTxId ?? "") !== orderTxId) continue;
      const confirmed = Number(txn.confirmedRound ?? 0);
      if (confirmed > 0) return;
    } catch {
      continue;
    }
  }

  throw new Error("No on-chain delivery proof found for this order");
}

export async function POST(req: NextRequest) {
  try {
    const { sellerAddress, orderTxId, deliveryKind, fields, instructions } =
      (await req.json()) as {
        sellerAddress?: string;
        orderTxId?: string;
        deliveryKind?: string;
        fields?: Record<string, string>;
        instructions?: string;
      };

    if (!sellerAddress || !orderTxId) {
      return NextResponse.json(
        { error: "sellerAddress and orderTxId required" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(sellerAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid sellerAddress" },
        { status: 400 },
      );
    }

    const indexer = getIndexer();
    const lookup = await indexer.lookupTransactionByID(orderTxId).do();
    const txn = (lookup as { transaction?: { note?: unknown } }).transaction;
    const noteStr = decodeNote(txn?.note);
    const parsedOrder = parseOrderNote(noteStr);
    if (!parsedOrder) {
      return NextResponse.json(
        { error: "Order note not found" },
        { status: 404 },
      );
    }
    if (parsedOrder.seller !== sellerAddress) {
      return NextResponse.json(
        { error: "Order seller does not match sellerAddress" },
        { status: 403 },
      );
    }

    await assertHasDeliveryProof(sellerAddress, orderTxId);

    const kind = normalizeDeliveryKind(
      deliveryKind ?? parsedOrder.deliveryKind,
    );
    const safeFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
      const key = String(k).trim();
      const val = String(v ?? "");
      if (!key || !val) continue;
      safeFields[key.slice(0, 64)] = val.slice(0, 1024);
    }

    const record: DeliveryRecord = {
      orderTxId,
      seller: sellerAddress,
      deliveredAt: Date.now(),
      deliveryKind: kind,
      fields: safeFields,
      instructions: instructions?.trim()
        ? instructions.trim().slice(0, 4000)
        : undefined,
    };

    const saved = await setDelivery(record);
    return NextResponse.json({ success: true, delivery: saved });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to submit delivery";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
