import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer } from "@/lib/blockchain/algorand";
import { rememberOrder } from "@/lib/orders/registry";
import { getHeldPayment, holdVaultFunds } from "@/lib/blockchain/vault";
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

export async function POST(req: NextRequest) {
  try {
    const { txId, buyerAddress } = (await req.json()) as {
      txId?: string;
      buyerAddress?: string;
    };

    if (!txId || !buyerAddress) {
      return NextResponse.json(
        { error: "txId and buyerAddress are required" },
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
    const lookup = await indexer.lookupTransactionByID(txId).do();
    const txn = (
      lookup as {
        transaction?: {
          note?: unknown;
          confirmedRound?: number | bigint;
        };
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
    if (parsed.buyer !== buyerAddress) {
      return NextResponse.json(
        { error: "Order buyer does not match buyerAddress" },
        { status: 403 },
      );
    }

    const confirmedRound = Number(txn?.confirmedRound ?? 0);
    if (confirmedRound <= 0) {
      return NextResponse.json(
        { error: "Transaction not confirmed yet" },
        { status: 409 },
      );
    }

    const order: OrderRecord = {
      orderTxId: txId,
      listingTxId: parsed.listingTxId,
      buyer: parsed.buyer,
      seller: parsed.seller,
      type: parsed.type,
      service: parsed.service,
      price: parsed.price,
      description: parsed.description,
      deliveryKind: parsed.deliveryKind,
      accessDurationDays: parsed.accessDurationDays,
      createdAt: parsed.createdAt,
      confirmedRound,
    };

    const existingHold = await getHeldPayment(txId);
    if (!existingHold) {
      try {
        await holdVaultFunds({
          orderTxId: txId,
          buyerAddress: parsed.buyer,
          amountAlgo: parsed.price,
          sellerAddress: parsed.seller,
          service: parsed.service,
        });
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `Vault hold failed: ${e.message}`
                : "Vault hold failed",
          },
          { status: 400 },
        );
      }
    }

    await rememberOrder(order);

    return NextResponse.json({ success: true, order });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to confirm order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
