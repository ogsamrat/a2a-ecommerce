import { NextResponse } from "next/server";
import { initAccount, getNetworkMode } from "@/lib/blockchain/algorand";
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

    const accounts = await initAccount();

    const listingTxIds: string[] = [];

    return NextResponse.json({
      success: true,
      account: accounts.primary,
      listingTxIds,
      actions: [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Init failed";
    if (isRecoverableInitError(msg)) {
      return NextResponse.json({
        success: false,
        listingTxIds: [],
        actions: [],
        warning: msg,
      });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
