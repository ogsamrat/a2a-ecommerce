/**
 * GET  /api/vault/info   — vault address + balance
 * POST /api/vault/fund   — build unsigned funding txn (user wallet → vault)
 * POST /api/vault/execute — auto-sign payment from vault to seller
 */

import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";
import {
  getVaultAddress,
  getVaultBalance,
  getVaultSpendableAlgo,
  vaultPayment,
  vaultSignAndSubmit,
} from "@/lib/blockchain/vault";

// ── GET: vault info ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    const address = getVaultAddress();
    const balance = await getVaultBalance();
    return NextResponse.json({ address, balance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vault not configured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: actions ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid or empty JSON body" },
        { status: 400 },
      );
    }
    const { action } = body as { action: string };

    if (!action) {
      return NextResponse.json(
        { error: "action is required (fund | execute | sign)" },
        { status: 400 },
      );
    }

    // ─── Fund vault (returns unsigned txn for user wallet to sign) ────
    if (action === "fund") {
      const { senderAddress, amountAlgo } = body as {
        senderAddress: string;
        amountAlgo: number;
      };
      if (!senderAddress || !amountAlgo) {
        return NextResponse.json(
          { error: "senderAddress and amountAlgo required" },
          { status: 400 },
        );
      }

      const vaultAddr = getVaultAddress();
      const algod = getClient().client.algod;
      const params = await algod.getTransactionParams().do();

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: algosdk.Address.fromString(senderAddress),
        receiver: algosdk.Address.fromString(vaultAddr),
        amount: Math.round(amountAlgo * 1_000_000),
        note: new TextEncoder().encode("A2A Vault Funding"),
        suggestedParams: params,
      });

      const unsignedB64 = Buffer.from(
        algosdk.encodeUnsignedTransaction(txn),
      ).toString("base64");

      return NextResponse.json({
        unsignedTxn: unsignedB64,
        txnId: txn.txID(),
        vaultAddress: vaultAddr,
        amountAlgo,
      });
    }

    // ─── Execute payment from vault (auto-signed) ────────────────────
    if (action === "execute") {
      const { receiverAddress, amountAlgo, note } = body as {
        receiverAddress: string;
        amountAlgo: number;
        note?: string;
      };
      if (!receiverAddress || !amountAlgo) {
        return NextResponse.json(
          { error: "receiverAddress and amountAlgo required" },
          { status: 400 },
        );
      }

      // Check balance
      const balance = await getVaultBalance();
      const spendable = await getVaultSpendableAlgo();
      if (spendable < amountAlgo + 0.001) {
        return NextResponse.json(
          {
            error:
              `Vault has ${balance.toFixed(4)} ALGO total, ${spendable.toFixed(4)} ALGO spendable. ` +
              `Needs at least ${(amountAlgo + 0.001).toFixed(4)} ALGO including fee buffer.`,
            balance,
            spendable,
          },
          { status: 402 },
        );
      }

      const result = await vaultPayment(
        receiverAddress,
        amountAlgo,
        note ?? "A2A Vault Payment",
      );

      const newBalance = await getVaultBalance();

      return NextResponse.json({
        success: true,
        ...result,
        amount: amountAlgo,
        vaultBalance: newBalance,
      });
    }

    // ─── Auto-sign arbitrary txn with vault key ──────────────────────
    if (action === "sign") {
      const { unsignedTxn } = body as { unsignedTxn: string };
      if (!unsignedTxn) {
        return NextResponse.json(
          { error: "unsignedTxn required" },
          { status: 400 },
        );
      }

      const result = await vaultSignAndSubmit(unsignedTxn);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vault operation failed";
    const isMinBalance = /below min|TransactionPool\.Remember/i.test(msg);
    return NextResponse.json(
      { error: msg },
      { status: isMinBalance ? 402 : 500 },
    );
  }
}
