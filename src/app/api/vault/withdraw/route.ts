import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { executeAutonomousTransfer } from "@/lib/blockchain/algorand";
import {
  rollbackVaultWithdrawal,
  withdrawVaultBalance,
} from "@/lib/blockchain/vault";

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

    await withdrawVaultBalance(buyerAddress, amount);

    try {
      const payout = await executeAutonomousTransfer(
        buyerAddress,
        amount,
        "a2a-vault-withdraw:" +
          JSON.stringify({
            v: 1,
            buyer: buyerAddress,
            amount,
            at: Date.now(),
          }),
      );

      return NextResponse.json({
        success: true,
        txId: payout.txId,
        confirmedRound: payout.confirmedRound,
        amountAlgo: amount,
      });
    } catch (payoutError) {
      await rollbackVaultWithdrawal(buyerAddress, amount);
      throw payoutError;
    }
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to withdraw from vault";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
