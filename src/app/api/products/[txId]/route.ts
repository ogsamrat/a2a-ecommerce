/**
 * x402-inspired credentials endpoint.
 *
 * Flow:
 *  1. GET /api/products/{listingTxId}
 *     → 402 with PaymentRequirements (amount = listing price, payTo = seller)
 *  2. Client pays seller on-chain (signless — agent signs automatically)
 *  3. GET /api/products/{listingTxId}?proof={paymentTxId}
 *     → Server verifies payment on-chain via algod
 *     → Returns decrypted credentials to buyer
 *
 * No external facilitator — payment verification is direct on-chain check.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildPaymentRequirements, verifyOnChainPayment } from "@/lib/x402";
import { getCredentialEntry, decryptCredentials } from "@/lib/credentials";

function resourceUrl(req: NextRequest, txId: string): string {
  const host  = req.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}/api/products/${txId}`;
}

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ txId: string }> }
) {
  const { txId } = await context.params;
  const entry = getCredentialEntry(txId);

  if (!entry) {
    return NextResponse.json(
      { error: "Listing not found or credentials not stored for this TX ID" },
      { status: 404 }
    );
  }

  const resource = resourceUrl(req, txId);
  const payReqs  = buildPaymentRequirements({
    resource,
    description:   `Purchase credentials for: ${entry.service}`,
    sellerAddress: entry.sellerAddress,
    priceAlgo:     entry.price,
  });

  const paymentProof = req.nextUrl.searchParams.get("proof");
  const xPayment     = req.headers.get("X-PAYMENT");

  // ── No payment evidence → return 402 ──────────────────────────────────────
  if (!paymentProof && !xPayment) {
    return NextResponse.json(
      {
        x402Version: 1,
        error:       "Payment required to access credentials",
        accepts:     [payReqs],
      },
      {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── Verify payment on-chain ────────────────────────────────────────────────
  const proofTxId = paymentProof ?? xPayment ?? "";

  // Accept negotiated price via ?amount= param (negotiation can reduce price)
  const amountParam = req.nextUrl.searchParams.get("amount");
  const verifyPrice = amountParam ? Math.min(Number(amountParam), entry.price) : entry.price;

  const verification = await verifyOnChainPayment({
    paymentTxId:   proofTxId,
    sellerAddress: entry.sellerAddress,
    requiredAlgo:  verifyPrice,
  });

  if (!verification.isValid) {
    return NextResponse.json(
      {
        x402Version: 1,
        error:       `Payment verification failed: ${verification.reason}`,
      },
      { status: 402 }
    );
  }

  // ── Decrypt and return credentials ─────────────────────────────────────────
  const credentials = decryptCredentials(txId);
  if (!credentials) {
    return NextResponse.json(
      { error: "Credentials could not be decrypted" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success:       true,
      product:       "credentials",
      service:       entry.service,
      sellerAddress: entry.sellerAddress,
      paymentTxId:   proofTxId,
      confirmedRound: verification.confirmedRound,
      credentials:   {
        username:    credentials.username,
        password:    credentials.password,
        productType: credentials.productType,
        notes:       credentials.notes,
      },
      deliveredAt: new Date().toISOString(),
      x402Version: 1,
    },
    {
      headers: {
        "X-PAYMENT-TRANSACTION": proofTxId,
        "X-PAYMENT-AMOUNT":      String(Math.round(entry.price * 1_000_000)),
      },
    }
  );
}
