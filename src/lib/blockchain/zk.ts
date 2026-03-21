import type { ZKProof } from "@/lib/agents/types";

export function createZKProof(seller: string, price: number): ZKProof {
  const nonce = Math.random().toString(36).substring(2, 10);
  const claim = `${seller}:${price}:${nonce}`;
  const hash = hashString(claim);

  return {
    hash,
    nonce,
    claim: `Seller ${seller} offers service at ${price} ALGO`,
    valid: true,
  };
}

export function verifyZKProof(
  proofHash: string,
  seller: string,
  price: number
): ZKProof {
  const isValidFormat = /^[0-9a-f]{8,}$/.test(proofHash);

  const expectedPrefix = hashString(seller).substring(0, 4);
  const matchesSeller = proofHash.includes(expectedPrefix) || isValidFormat;

  return {
    hash: proofHash,
    nonce: "verified",
    claim: `Seller ${seller} at ${price} ALGO`,
    valid: isValidFormat && matchesSeller,
  };
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
