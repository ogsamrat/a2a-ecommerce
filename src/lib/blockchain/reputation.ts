import algosdk from "algosdk";
import { getClient } from "@/lib/blockchain/algorand";

export async function getAgentReputation(agentAddress: string): Promise<number> {
  try {
    const appId = process.env.REPUTATION_APP_ID;
    if (!appId) return 0;
    
    const algorand = getClient();
    const algod = algorand.client.algod;
    
    const boxName = Buffer.concat([
      Buffer.from("a"),
      algosdk.decodeAddress(agentAddress).publicKey,
    ]);

    const boxValue = await algod.getApplicationBoxByName(BigInt(appId), boxName).do();
    const raw = boxValue.value;
    
    const totalScore = Number(new DataView(raw.buffer, raw.byteOffset, 8).getBigUint64(0));
    const feedbackCount = Number(new DataView(raw.buffer, raw.byteOffset + 8, 8).getBigUint64(0));
    
    if (feedbackCount > 0) {
      return Math.round((totalScore * 100) / feedbackCount);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}
