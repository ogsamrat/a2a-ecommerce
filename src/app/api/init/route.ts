import { NextResponse } from "next/server";
import { initAccounts, getNetworkMode } from "@/lib/blockchain/algorand";
import { postListingsOnChain } from "@/lib/blockchain/listings";
import { createAction } from "@/lib/a2a/messaging";

function isRecoverableInitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("seed length must be 32") ||
    lower.includes("must be base64 of a 64-byte") ||
    lower.includes("localnet") ||
    lower.includes("dispenser") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("invalid") ||
    lower.includes("overspend") ||
    lower.includes("insufficient") ||
    lower.includes("balance")
  );
}

export async function POST() {
  try {
    const network = getNetworkMode();
    const networkLabel =
      network === "testnet" ? "Algorand TestNet" : "Algorand LocalNet";

    const actions = [
      createAction(
        "system",
        "Algorand",
        "transaction",
        `Connecting to ${networkLabel}...`,
      ),
    ];

    const accounts = await initAccounts();
    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        `Accounts created on ${networkLabel}:\n` +
          `• **Buyer:** \`${accounts.buyer.address.slice(0, 12)}...${accounts.buyer.address.slice(-6)}\` (${accounts.buyer.balance.toFixed(2)} ALGO)\n` +
          `• **Sellers:** ${Object.keys(accounts.sellers).length} accounts funded`,
        { accounts },
      ),
    );

    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        "Posting service listings on-chain via 0 ALGO transactions...",
      ),
    );

    const listingTxIds = await postListingsOnChain();
    actions.push(
      createAction(
        "system",
        "Algorand",
        "result",
        `**${listingTxIds.length} listings** posted on-chain!\n` +
          listingTxIds
            .map((tx, i) => `• Listing ${i + 1}: \`${tx.slice(0, 20)}...\``)
            .join("\n"),
        { listingTxIds },
      ),
    );

    return NextResponse.json({
      success: true,
      accounts,
      listingTxIds,
      actions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Init failed";
    if (isRecoverableInitError(msg)) {
      return NextResponse.json({
        success: false,
        demoMode: true,
        listingTxIds: [],
        actions: [
          createAction(
            "system",
            "Algorand",
            "result",
            `Demo mode active: ${msg}. Using fallback marketplace listings.`,
            { warning: msg },
          ),
        ],
        warning: msg,
      });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
