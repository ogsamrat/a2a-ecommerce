import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

interface ReputationBatchItem {
  agent: string;
  appId: number;
  isRegistered: boolean;
  reputation: number;
  feedbackCount: number;
  totalScore: number;
  isActive: boolean;
  registeredAt?: number;
}

function asRegisteredResult(
  appId: number,
  agentAddress: string,
  raw: Uint8Array,
): ReputationBatchItem {
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
    feedbackCount > 0 ? Math.round((totalScore * 100) / feedbackCount) : 0;

  return {
    agent: agentAddress,
    appId,
    isRegistered: true,
    reputation,
    feedbackCount,
    totalScore,
    isActive: isActiveRaw === 1,
    registeredAt,
  };
}

function asUnregisteredResult(
  appId: number,
  agentAddress: string,
): ReputationBatchItem {
  return {
    agent: agentAddress,
    appId,
    isRegistered: false,
    reputation: 0,
    feedbackCount: 0,
    totalScore: 0,
    isActive: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { agents } = (await req.json()) as { agents?: string[] };
    if (!Array.isArray(agents) || agents.length === 0) {
      return NextResponse.json(
        { error: "agents array required" },
        { status: 400 },
      );
    }

    const appIdRaw = process.env.REPUTATION_APP_ID;
    if (!appIdRaw) {
      return NextResponse.json(
        { error: "REPUTATION_APP_ID not configured" },
        { status: 500 },
      );
    }

    const appId = Number(appIdRaw);
    const uniqueAgents = [
      ...new Set(agents.map((a) => a.trim()).filter(Boolean)),
    ];
    const algorand = getClient();
    const algod = algorand.client.algod;

    const results: ReputationBatchItem[] = [];

    for (const agentAddress of uniqueAgents) {
      try {
        const boxName = Buffer.concat([
          Buffer.from("a"),
          algosdk.decodeAddress(agentAddress).publicKey,
        ]);
        const boxValue = await algod
          .getApplicationBoxByName(BigInt(appId), boxName)
          .do();
        results.push(asRegisteredResult(appId, agentAddress, boxValue.value));
      } catch {
        results.push(asUnregisteredResult(appId, agentAddress));
      }
    }

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Batch reputation query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
