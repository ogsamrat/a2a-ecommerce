import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getIndexer, getNetworkMode } from "@/lib/blockchain/algorand";
import { getRememberedOrders, rememberOrders } from "@/lib/orders/registry";
import { getDelivery } from "@/lib/delivery/registry";
import { getFeedbackForOrder } from "@/lib/feedback/ledger";
import type { OnChainListing, OrderRecord } from "@/lib/agents/types";

function normalizeType(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-") || "unknown"
  );
}

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

type EnrichedOrder = OrderRecord & {
  deliveredAt: number | null;
  feedback: Awaited<ReturnType<typeof getFeedbackForOrder>>;
};

async function mergeOrders(
  primary: OrderRecord[],
  fallback: OrderRecord[],
): Promise<EnrichedOrder[]> {
  const byId = new Map<string, OrderRecord>();
  for (const item of fallback) {
    if (!item.orderTxId) continue;
    byId.set(item.orderTxId, item);
  }
  for (const item of primary) {
    if (!item.orderTxId) continue;
    byId.set(item.orderTxId, item);
  }

  const merged = [...byId.values()].sort((a, b) => {
    if (b.confirmedRound !== a.confirmedRound)
      return b.confirmedRound - a.confirmedRound;
    return b.createdAt - a.createdAt;
  });

  const enriched = await Promise.all(
    merged.map(async (o) => {
      const delivery = await getDelivery(o.orderTxId);
      const feedback = await getFeedbackForOrder(o.orderTxId);
      return {
        ...o,
        deliveredAt: delivery?.deliveredAt ?? null,
        feedback,
      };
    }),
  );

  return enriched;
}

export async function GET(req: NextRequest) {
  try {
    const role = (
      req.nextUrl.searchParams.get("role") ?? "buyer"
    ).toLowerCase();
    const buyer = req.nextUrl.searchParams.get("buyer")?.trim() ?? "";
    const seller = req.nextUrl.searchParams.get("seller")?.trim() ?? "";

    if (role !== "buyer" && role !== "seller") {
      return NextResponse.json(
        { error: "role must be buyer or seller" },
        { status: 400 },
      );
    }
    if (role === "buyer" && !buyer) {
      return NextResponse.json(
        { error: "buyer query param required" },
        { status: 400 },
      );
    }
    if (role === "seller" && !seller) {
      return NextResponse.json(
        { error: "seller query param required" },
        { status: 400 },
      );
    }

    const addr = role === "buyer" ? buyer : seller;
    try {
      algosdk.Address.fromString(addr);
    } catch {
      return NextResponse.json(
        { error: "Invalid buyer/seller address" },
        { status: 400 },
      );
    }

    const network = getNetworkMode();
    const remembered = await getRememberedOrders();
    const rememberedFiltered = remembered.filter((o) => {
      if (role === "buyer") return o.buyer === buyer;
      return o.seller === seller;
    });

    const indexer = getIndexer();
    const notePrefix = Buffer.from("a2a-order:").toString("base64");
    const orders: OrderRecord[] = [];

    let searchResult;
    try {
      const reqBuilder = indexer
        .searchForTransactions()
        .address(addr)
        .notePrefix(notePrefix)
        .txType("pay")
        .limit(250);
      searchResult = await reqBuilder.do();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Indexer query failed";
      const merged = await mergeOrders([], rememberedFiltered);
      return NextResponse.json({
        orders: merged,
        count: merged.length,
        network,
        source: "memory",
        warning: `Order fetch degraded: ${msg}`,
      });
    }

    for (const txn of searchResult.transactions ?? []) {
      try {
        const txId = txn.id ?? "";
        if (!txId) continue;
        const noteStr = decodeNote(txn.note);
        const parsed = parseOrderNote(noteStr);
        if (!parsed) continue;

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
          confirmedRound: Number(txn.confirmedRound ?? 0),
        };

        if (role === "buyer" && order.buyer !== buyer) continue;
        if (role === "seller" && order.seller !== seller) continue;
        orders.push(order);
      } catch {
        // ignore
      }
    }

    await rememberOrders(orders);
    const merged = await mergeOrders(orders, rememberedFiltered);

    return NextResponse.json({
      orders: merged,
      count: merged.length,
      network,
      source: "onchain+memory",
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch orders";
    const network = getNetworkMode();
    return NextResponse.json({ error: msg, network }, { status: 500 });
  }
}
