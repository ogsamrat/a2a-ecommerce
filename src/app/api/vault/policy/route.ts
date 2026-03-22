import { NextRequest, NextResponse } from "next/server";
import { updateVaultPolicy } from "@/lib/blockchain/vault";

export async function POST(req: NextRequest) {
  try {
    const { buyerAddress, policy } = (await req.json()) as {
      buyerAddress?: string;
      policy?: {
        maxPerOrderAlgo?: number;
        dailyCapAlgo?: number;
        allowedSellers?: string[];
        allowedServices?: string[];
        expiresAt?: string;
      };
    };

    if (!buyerAddress) {
      return NextResponse.json(
        { error: "buyerAddress is required" },
        { status: 400 },
      );
    }

    const account = await updateVaultPolicy(buyerAddress, policy ?? {});
    return NextResponse.json({ success: true, account });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to update vault policy";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
