import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";
import { getVaultDepositNotePrefix } from "@/lib/blockchain/vault";

function getAutonomousAddressFromEnv(): string {
  const raw = process.env.AVM_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error("AVM_PRIVATE_KEY is required for vault deposits");
  }

  if (raw.includes(" ")) {
    return algosdk.mnemonicToSecretKey(raw).addr.toString();
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 64) {
    throw new Error(
      "AVM_PRIVATE_KEY must be base64 of a 64-byte Algorand secret key",
    );
  }

  const sk = Uint8Array.from(decoded);
  return new algosdk.Address(sk.slice(32)).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { buyerAddress, amountAlgo } = (await req.json()) as {
      buyerAddress?: string;
      amountAlgo?: number;
    };

    const amount = Number(amountAlgo);
    if (!buyerAddress || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "buyerAddress and positive amountAlgo are required" },
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

    const vaultAddress = getAutonomousAddressFromEnv();
    const algorand = getClient();
    const params = await algorand.client.algod.getTransactionParams().do();

    const note = getVaultDepositNotePrefix(buyerAddress);
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: algosdk.Address.fromString(buyerAddress),
      receiver: algosdk.Address.fromString(vaultAddress),
      amount: algosdk.algosToMicroalgos(amount),
      note: new TextEncoder().encode(note),
      suggestedParams: params,
    });

    const unsignedTxn = Buffer.from(
      algosdk.encodeUnsignedTransaction(txn),
    ).toString("base64");

    return NextResponse.json({
      success: true,
      unsignedTxn,
      txnId: txn.txID(),
      vaultAddress,
      amountAlgo: amount,
      note,
    });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to prepare vault deposit";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
