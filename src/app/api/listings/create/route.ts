import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { createHash, randomBytes } from "crypto";
import { getClient } from "@/lib/blockchain/algorand";
import { storeCredentials } from "@/lib/credentials";

export async function POST(req: NextRequest) {
  try {
    const {
      senderAddress,
      type,
      service,
      price,
      description,
      username,
      password,
      productType,
      notes,
    } = await req.json();

    if (!senderAddress || !type || !service || !price) {
      return NextResponse.json(
        { error: "senderAddress, type, service, price required" },
        { status: 400 }
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required — they will be delivered to the buyer after payment" },
        { status: 400 }
      );
    }

    const secret   = randomBytes(32).toString("hex");
    const preimage = `${secret}|${senderAddress}|${price}|${description ?? ""}`;
    const commitment = createHash("sha256").update(preimage).digest("hex");

    const noteData = {
      type,
      service,
      price,
      seller:      senderAddress,
      description: description ?? "",
      timestamp:   Date.now(),
      zkCommitment: commitment,
      hasCredentials: true, // flag so buyers know credentials are available
      productType: productType ?? type,
    };
    const noteStr = "a2a-listing:" + JSON.stringify(noteData);

    const algorand = getClient();
    const algod    = algorand.client.algod;
    const params   = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender:   algosdk.Address.fromString(senderAddress),
      receiver: algosdk.Address.fromString(senderAddress),
      amount:   0,
      note:     new TextEncoder().encode(noteStr),
      suggestedParams: params,
    });

    const txId       = txn.txID();
    const unsignedB64 = Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64");

    // Encrypt and store credentials — keyed by the pending TX ID.
    // We also register by ZK commitment so we can look up before confirmation.
    const keyHash = storeCredentials({
      txId,
      service,
      sellerAddress: senderAddress,
      price: Number(price),
      credentials: { username, password, productType: productType ?? type, notes: notes ?? "" },
    });

    return NextResponse.json({
      unsignedTxn:  unsignedB64,
      txnId:        txId,
      zkSecret:     secret,
      zkCommitment: commitment,
      keyHash,
      listing:      { ...noteData, hasCredentials: true },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to build listing txn";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
