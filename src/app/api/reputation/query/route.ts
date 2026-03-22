import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

export async function GET(req: NextRequest) {
  try {
    const agentAddress = req.nextUrl.searchParams.get("agent");
    if (!agentAddress) {
      return NextResponse.json(
        { error: "agent query param required" },
        { status: 400 },
      );
    }

    const appId = process.env.REPUTATION_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "REPUTATION_APP_ID not configured" },
        { status: 500 },
      );
    }

    const algorand = getClient();
    const algod = algorand.client.algod;

    const boxName = Buffer.concat([
      Buffer.from("a"),
      algosdk.decodeAddress(agentAddress).publicKey,
    ]);

    try {
      const boxValue = await algod
        .getApplicationBoxByName(BigInt(appId), boxName)
        .do();
      const raw = boxValue.value;

      const totalScore = Number(
        new DataView(raw.buffer, raw.byteOffset, 8).getBigUint64(0),
      );
      const feedbackCount = Number(
        new DataView(raw.buffer, raw.byteOffset + 8, 8).getBigUint64(0),
      );
      const registeredAt = Number(
        new DataView(raw.buffer, raw.byteOffset + 16, 8).getBigUint64(0),
      );
      const isActiveRaw = Number(
        new DataView(raw.buffer, raw.byteOffset + 24, 8).getBigUint64(0),
      );

      const reputation =
        feedbackCount > 0
          ? Math.max(0, Math.min(100, Math.round(totalScore / feedbackCount)))
          : 0;

      return NextResponse.json({
        agent: agentAddress,
        appId: Number(appId),
        isRegistered: true,
        reputation,
        feedbackCount,
        totalScore,
        isActive: isActiveRaw === 1,
        registeredAt,
      });
    } catch {
      return NextResponse.json({
        agent: agentAddress,
        appId: Number(appId),
        isRegistered: false,
        reputation: 0,
        feedbackCount: 0,
        totalScore: 0,
        isActive: false,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
