import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

export async function POST(req: NextRequest) {
  try {
    const { sellerAddress, orderTxId } = (await req.json()) as {
      sellerAddress?: string;
      orderTxId?: string;
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

    const proofData = {
      v: 1,
      orderTxId: String(orderTxId),
      seller: String(sellerAddress),
      createdAt: Date.now(),
    };
    const noteStr = "a2a-delivery-proof:" + JSON.stringify(proofData);

    const algorand = getClient();
    const algod = algorand.client.algod;
    const params = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.Address.fromString(sellerAddress),
      receiver: algosdk.Address.fromString(sellerAddress),
      amount: 0,
      note: new TextEncoder().encode(noteStr),
      suggestedParams: params,
    });

    const unsignedTxnB64 = Buffer.from(
      algosdk.encodeUnsignedTransaction(txn),
    ).toString("base64");

    return NextResponse.json({
      unsignedTxn: unsignedTxnB64,
      txnId: txn.txID(),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to build delivery proof";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
