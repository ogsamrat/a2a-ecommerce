import { createHash, randomBytes } from "crypto";
import { getClient } from "./algorand";

export interface ZKCommitment {
  commitment: string;
  secret: string;
}

export function createZKCommitment(
  seller: string,
  price: number,
  capabilities: string
): ZKCommitment {
  const secret = randomBytes(32).toString("hex");
  const preimage = `${secret}|${seller}|${price}|${capabilities}`;
  const commitment = createHash("sha256").update(preimage).digest("hex");
  return { commitment, secret };
}

export function verifyZKCommitment(
  commitment: string,
  secret: string,
  seller: string,
  price: number,
  capabilities: string
): boolean {
  const preimage = `${secret}|${seller}|${price}|${capabilities}`;
  const recomputed = createHash("sha256").update(preimage).digest("hex");
  return recomputed === commitment;
}

/**
 * Verify a ZK commitment on-chain by reading the ZKCommitment contract's BoxMap.
 *
 * The contract stores CommitmentRecords in a BoxMap with key prefix "c" + 32-byte hash.
 * Layout: committer(32) | createdRound(8) | isRevealed(8)
 *
 * Returns:
 *   0 = not found on-chain
 *   1 = committed (hash stored, not yet revealed)
 *   2 = revealed & verified (preimage was verified by AVM sha256)
 */
export async function verifyZKOnChain(commitmentHex: string): Promise<number> {
  const appId = process.env.ZK_APP_ID;
  if (!appId) return 0;

  try {
    const algod = getClient().client.algod;
    // Convert hex commitment to 32-byte buffer
    const hashBytes = Buffer.from(commitmentHex, "hex");
    if (hashBytes.length !== 32) return 0;

    // BoxMap key = prefix "c" + 32-byte commitment hash
    const boxName = Buffer.concat([Buffer.from("c"), hashBytes]);

    const box = await algod.getApplicationBoxByName(BigInt(appId), boxName).do();
    const raw = box.value;

    // CommitmentRecord layout: committer(32 bytes) | createdRound(8 bytes) | isRevealed(8 bytes)
    if (raw.length < 48) return 1; // committed but can't parse fully

    const view = new DataView(raw.buffer, raw.byteOffset);
    const isRevealed = Number(view.getBigUint64(40)); // offset 32+8 = 40
    return isRevealed === 1 ? 2 : 1;
  } catch {
    // Box not found = commitment not on-chain
    return 0;
  }
}
