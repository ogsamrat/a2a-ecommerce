import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

export async function POST(req: NextRequest) {
  try {
    const { senderAddress, receiverAddress, amountAlgo, note } =
      await req.json();
    const parsedAmount = Number(amountAlgo);

    if (!senderAddress || !receiverAddress || amountAlgo === undefined) {
      return NextResponse.json(
        { error: "senderAddress, receiverAddress, amountAlgo required" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "amountAlgo must be a positive number" },
        { status: 400 },
      );
    }

    try {
      algosdk.Address.fromString(senderAddress);
      algosdk.Address.fromString(receiverAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid sender or receiver address" },
        { status: 400 },
      );
    }

    const algorand = getClient();
    const algod = algorand.client.algod;
    const params = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.Address.fromString(senderAddress),
      receiver: algosdk.Address.fromString(receiverAddress),
      amount: algosdk.algosToMicroalgos(parsedAmount),
      note: note ? new TextEncoder().encode(note) : undefined,
      suggestedParams: params,
    });

    const unsignedTxnB64 = Buffer.from(
      algosdk.encodeUnsignedTransaction(txn),
    ).toString("base64");

    return NextResponse.json({
      unsignedTxn: unsignedTxnB64,
      txnId: txn.txID(),
      details: {
        sender: senderAddress,
        receiver: receiverAddress,
        amount: parsedAmount,
        fee: Number(txn.fee) / 1e6,
      },
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to build payment txn";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
