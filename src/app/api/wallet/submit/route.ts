import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

export async function POST(req: NextRequest) {
  try {
    const { signedTxn } = await req.json();
    if (!signedTxn || typeof signedTxn !== "string") {
      return NextResponse.json(
        { error: "signedTxn (base64) required" },
        { status: 400 },
      );
    }

    const algorand = getClient();
    const algod = algorand.client.algod;

    const rawTxn = Uint8Array.from(Buffer.from(signedTxn, "base64"));
    if (!rawTxn.length) {
      return NextResponse.json(
        { error: "signedTxn is empty or invalid base64" },
        { status: 400 },
      );
    }

    const { txid } = await algod.sendRawTransaction(rawTxn).do();
    const confirmation = await algosdk.waitForConfirmation(algod, txid, 10);
    const round = Number(confirmation.confirmedRound ?? 0);

    const network =
      process.env.ALGORAND_NETWORK?.toLowerCase() === "testnet"
        ? "testnet"
        : "localnet";
    const explorerUrl =
      network === "testnet"
        ? `https://testnet.explorer.perawallet.app/tx/${txid}`
        : null;

    return NextResponse.json({
      success: true,
      txId: txid,
      confirmedRound: round,
      explorerUrl,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Transaction submission failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
