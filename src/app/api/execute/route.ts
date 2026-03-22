/**
 * Execute: signless ALGO payment + x402-inspired credential delivery.
 *
 * Flow:
 *  1. Sign and broadcast ALGO payment (buyer → seller) using stored private key
 *     — completely signless from the UI perspective
 *  2. Use the confirmed payment TX as proof to call /api/products/{listingTxId}?proof={paymentTxId}
 *  3. Server verifies payment on-chain and returns decrypted credentials
 *  4. Auto-update seller reputation on-chain (fire-and-forget)
 */

import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { executePayment, getBalance, getStoredAccounts } from "@/lib/blockchain/algorand";
import { autoUpdateReputation } from "@/lib/blockchain/reputation";
import { createAction } from "@/lib/a2a/messaging";
import type { NegotiationSession } from "@/lib/agents/types";

export async function POST(req: NextRequest) {
  try {
    const { deal } = (await req.json()) as { deal: NegotiationSession };

    if (!deal?.sellerAddress || typeof deal?.finalPrice !== "number") {
      return NextResponse.json({ error: "Deal details are required" }, { status: 400 });
    }

    const stored = getStoredAccounts();
    if (!stored) {
      return NextResponse.json(
        { error: "Accounts not initialized — call /api/init first" },
        { status: 400 }
      );
    }

    if (!process.env.AVM_PRIVATE_KEY) {
      return NextResponse.json({ error: "AVM_PRIVATE_KEY not configured" }, { status: 500 });
    }

    const rawKey  = Buffer.from(process.env.AVM_PRIVATE_KEY, "base64");
    const acct    = algosdk.mnemonicToSecretKey(algosdk.secretKeyToMnemonic(rawKey));
    const buyerAddr = acct.addr.toString();
    const buyerSk   = acct.sk;

    const payableAmount = Math.max(deal.finalPrice, 0.001);

    const actions = [
      createAction(
        "buyer",
        "Buyer Agent",
        "transaction",
        `Executing signless ALGO payment...\n` +
        `**${payableAmount} ALGO** → **${deal.sellerName}** (\`${deal.sellerAddress.slice(0, 14)}...\`)\n` +
        `Protocol: x402 / on-chain proof`
      ),
    ];

    // ── Step 1: Execute ALGO payment (signless — buyer key is server-side) ───
    const escrow = await executePayment(deal.sellerAddress, payableAmount);

    const buyerBal  = await getBalance(escrow.buyerAddress);
    const sellerBal = await getBalance(escrow.sellerAddress);

    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        `**Payment Confirmed On-Chain!** (signless x402 flow)\n` +
        `• **TX ID:** \`${escrow.txId}\`\n` +
        `• **Round:** ${escrow.confirmedRound}\n` +
        `• **Amount:** ${escrow.amount} ALGO\n` +
        `• **Buyer:** ${buyerBal.toFixed(4)} ALGO  |  **Seller:** ${sellerBal.toFixed(4)} ALGO`,
        { escrow, buyerBal, sellerBal }
      )
    );

    // ── Step 2: Fetch credentials via x402 proof ─────────────────────────────
    let credentials: Record<string, unknown> | null = null;
    let credentialsError: string | null = null;

    if (deal.listingTxId) {
      try {
        const host       = req.headers.get("host") ?? "localhost:3000";
        const proto      = host.startsWith("localhost") ? "http" : "https";
        const productUrl = `${proto}://${host}/api/products/${deal.listingTxId}?proof=${escrow.txId}&amount=${payableAmount}`;

        const credRes  = await fetch(productUrl);
        const credData = await credRes.json() as Record<string, unknown>;

        if (credRes.ok && credData.credentials) {
          credentials = credData.credentials as Record<string, unknown>;
          actions.push(
            createAction(
              "system",
              "x402 Protocol",
              "result",
              `**Credentials delivered!** ✓\n` +
              `Service: ${String(credData.service ?? deal.service)}\n` +
              `Payment proof verified on-chain (round ${escrow.confirmedRound})`,
              { productTxId: deal.listingTxId, paymentTxId: escrow.txId }
            )
          );
        } else if (credRes.status === 404) {
          credentialsError = "Seller has not stored credentials for this listing";
          actions.push(
            createAction("system", "x402 Protocol", "result",
              `ℹ No credentials stored for this listing. Payment completed successfully.`)
          );
        } else {
          credentialsError = String(credData.error ?? `Credential fetch failed (${credRes.status})`);
          actions.push(
            createAction("system", "x402 Protocol", "result",
              `⚠ Credential delivery: ${credentialsError}\nPayment TX confirmed.`)
          );
        }
      } catch (err) {
        credentialsError = err instanceof Error ? err.message : "Credential fetch failed";
        actions.push(
          createAction("system", "x402 Protocol", "result",
            `⚠ Could not fetch credentials: ${credentialsError}`)
        );
      }
    }

    // ── Step 3: Auto-reputation (non-blocking) ────────────────────────────────
    let reputationTxId: string | null = null;
    try {
      reputationTxId = await autoUpdateReputation(buyerAddr, buyerSk, deal.sellerAddress, 85);
      if (reputationTxId) {
        actions.push(
          createAction(
            "system",
            "AgentReputation",
            "transaction",
            `**Reputation updated!** ${deal.sellerName} score += 85/100\n` +
            `• **Feedback TX:** \`${reputationTxId}\``,
            { reputationTxId, score: 85 }
          )
        );
      }
    } catch {
      // Best-effort
    }

    // ── Final summary ─────────────────────────────────────────────────────────
    actions.push(
      createAction(
        "buyer",
        "Buyer Agent",
        "result",
        credentials
          ? `✓ Deal complete! Credentials for **${deal.service}** received.\nPaid ${payableAmount} ALGO to ${deal.sellerName} (signless x402 payment).`
          : `✓ Payment complete! ${payableAmount} ALGO → ${deal.sellerName}.\n${credentialsError ?? "No credentials for this listing."}`
      )
    );

    return NextResponse.json({
      success: true,
      escrow,
      credentials,
      credentialsError,
      reputationTxId,
      paymentTxId: escrow.txId,
      actions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
