import { NextRequest, NextResponse } from "next/server";
import { getVaultAccount } from "@/lib/blockchain/vault";

export async function GET(req: NextRequest) {
  try {
    const buyerAddress = req.nextUrl.searchParams.get("buyerAddress")?.trim();
    if (!buyerAddress) {
      return NextResponse.json(
        { error: "buyerAddress query param required" },
        { status: 400 },
      );
    }

    const account = await getVaultAccount(buyerAddress);
    return NextResponse.json({ success: true, account });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch vault status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
