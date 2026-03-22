import { NextRequest, NextResponse } from "next/server";
import algosdk from "algosdk";
import { getClient, getIndexer } from "@/lib/blockchain/algorand";
import { creditVault, getVaultDepositNotePrefix } from "@/lib/blockchain/vault";

const INDEXER_LOOKUP_RETRIES = 4;
const INDEXER_LOOKUP_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeAddressLike(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    if (algosdk.isValidAddress(value)) return value;
    try {
      return algosdk.Address.fromString(value).toString();
    } catch {
      try {
        const decoded = Buffer.from(value, "base64");
        if (decoded.length === 32) {
          return algosdk.encodeAddress(Uint8Array.from(decoded));
        }
      } catch {
        return "";
      }
    }
    return "";
  }

  if (typeof value === "object" && value !== null && "publicKey" in value) {
    try {
      const pubKey = (value as { publicKey?: unknown }).publicKey;
      if (pubKey instanceof Uint8Array && pubKey.length === 32) {
        return algosdk.encodeAddress(pubKey);
      }
      return (value as algosdk.Address).toString();
    } catch {
      // ignore
    }
  }

  if (value instanceof Uint8Array) {
    return value.length === 32 ? algosdk.encodeAddress(value) : "";
  }

  if (Array.isArray(value)) {
    const nums = value.every((v) => typeof v === "number")
      ? Uint8Array.from(value as number[])
      : null;
    return nums && nums.length === 32 ? algosdk.encodeAddress(nums) : "";
  }

  return "";
}

function decodeNoteUtf8(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      return value;
    }
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    return Buffer.from(Uint8Array.from(value as number[])).toString("utf8");
  }

  return "";
}

function getAutonomousAddressFromEnv(): string {
  const raw = process.env.AVM_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "AVM_PRIVATE_KEY is required for vault credit verification",
    );
  }

  if (raw.includes(" ")) {
    return algosdk.mnemonicToSecretKey(raw).addr.toString();
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 64) {
    throw new Error(
      "AVM_PRIVATE_KEY must be base64 of a 64-byte Algorand secret key",
    );
  }

  const sk = Uint8Array.from(decoded);
  return new algosdk.Address(sk.slice(32)).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { buyerAddress, txId } = (await req.json()) as {
      buyerAddress?: string;
      txId?: string;
    };

    if (!buyerAddress || !txId) {
      return NextResponse.json(
        { error: "buyerAddress and txId are required" },
        { status: 400 },
      );
    }

    const expectedVaultAddress = getAutonomousAddressFromEnv();
    const algorand = getClient();
    const algod = algorand.client.algod;

    const confirmedPending = (await algosdk.waitForConfirmation(
      algod,
      txId,
      10,
    )) as unknown as {
      sender?: string;
      amount?: number;
      receiver?: string;
      [k: string]: unknown;
      txn?: {
        txn?: {
          snd?: Uint8Array | number[] | string;
          type?: string;
          rcv?: Uint8Array | number[] | string;
          amt?: number;
          note?: Uint8Array | number[] | string;
        };
      };
    };

    const info = (await algod
      .pendingTransactionInformation(txId)
      .do()) as unknown as {
      sender?: string;
      amount?: number;
      receiver?: string;
      [k: string]: unknown;
      txn?: {
        txn?: {
          snd?: Uint8Array | number[] | string;
          type?: string;
          rcv?: Uint8Array | number[] | string;
          amt?: number;
          note?: Uint8Array | number[] | string;
        };
      };
    };
    const indexer = getIndexer();
    let confirmed: {
      transaction?: {
        sender?: string;
        note?: string | Uint8Array | number[];
        "payment-transaction"?: {
          receiver?: string;
          amount?: number;
        };
      };
    } | null = null;

    for (let attempt = 0; attempt < INDEXER_LOOKUP_RETRIES; attempt++) {
      confirmed = (await indexer
        .lookupTransactionByID(txId)
        .do()
        .catch(() => null)) as {
        transaction?: {
          sender?: string;
          note?: string | Uint8Array | number[];
          "payment-transaction"?: {
            receiver?: string;
            amount?: number;
          };
        };
      } | null;

      if (confirmed?.transaction) break;
      await sleep(INDEXER_LOOKUP_DELAY_MS);
    }

    const pendingTxn = (confirmedPending.txn?.txn ?? {}) as {
      sender?: unknown;
      snd?: unknown;
      rcv?: unknown;
      payment?: { receiver?: unknown; amount?: unknown };
      type?: unknown;
      amt?: unknown;
      note?: unknown;
    };
    const txn = (info.txn?.txn ?? {}) as {
      sender?: unknown;
      snd?: unknown;
      rcv?: unknown;
      payment?: { receiver?: unknown; amount?: unknown };
      type?: unknown;
      amt?: unknown;
      note?: unknown;
    };
    const pendingPaymentTxn = (confirmedPending["payment-transaction"] ??
      {}) as {
      amount?: number;
      receiver?: string;
    };
    const paymentTxn = (info["payment-transaction"] ?? {}) as {
      amount?: number;
      receiver?: string;
    };
    const confirmedPayment = confirmed?.transaction?.["payment-transaction"];

    const sender =
      decodeAddressLike(pendingTxn?.sender) ||
      decodeAddressLike(pendingTxn?.snd) ||
      decodeAddressLike(confirmedPending.sender) ||
      decodeAddressLike(txn?.sender) ||
      decodeAddressLike(txn?.snd) ||
      decodeAddressLike(info.sender) ||
      decodeAddressLike(confirmed?.transaction?.sender);
    const receiver =
      decodeAddressLike(pendingTxn?.payment?.receiver) ||
      decodeAddressLike(pendingTxn?.rcv) ||
      decodeAddressLike(pendingPaymentTxn.receiver) ||
      decodeAddressLike(confirmedPending.receiver) ||
      decodeAddressLike(txn?.payment?.receiver) ||
      decodeAddressLike(txn?.rcv) ||
      decodeAddressLike(paymentTxn.receiver) ||
      decodeAddressLike(info.receiver) ||
      decodeAddressLike(confirmedPayment?.receiver);
    const amountMicro = Number(
      pendingTxn?.payment?.amount ??
        (pendingTxn?.type === "pay" ? pendingTxn.amt : undefined) ??
        pendingPaymentTxn.amount ??
        confirmedPending.amount ??
        txn?.payment?.amount ??
        (txn?.type === "pay" ? txn.amt : undefined) ??
        paymentTxn.amount ??
        confirmedPayment?.amount ??
        info.amount ??
        0,
    );
    const noteUtf8 =
      decodeNoteUtf8(pendingTxn?.note) ||
      decodeNoteUtf8(txn?.note) ||
      decodeNoteUtf8(confirmed?.transaction?.note);

    if (!sender || sender !== buyerAddress) {
      return NextResponse.json(
        {
          error: `Deposit sender does not match buyerAddress (detected=${sender || "unknown"}, expected=${buyerAddress})`,
          details: { detectedSender: sender, expectedBuyer: buyerAddress },
        },
        { status: 400 },
      );
    }

    if (!receiver || receiver !== expectedVaultAddress) {
      return NextResponse.json(
        {
          error: `Deposit receiver is not the configured vault address (detected=${receiver || "unknown"}, expected=${expectedVaultAddress})`,
          details: {
            detectedReceiver: receiver,
            expectedVaultAddress,
            receiverCandidates: {
              pendingTxnPaymentReceiver: String(
                pendingTxn?.payment?.receiver ?? "",
              ),
              pendingTxnRcv: String(pendingTxn?.rcv ?? ""),
              pendingPaymentReceiver: String(pendingPaymentTxn.receiver ?? ""),
              pendingReceiver: String(confirmedPending.receiver ?? ""),
              txnPaymentReceiver: String(txn?.payment?.receiver ?? ""),
              txnRcv: String(txn?.rcv ?? ""),
              paymentReceiver: String(paymentTxn.receiver ?? ""),
              infoReceiver: String(info.receiver ?? ""),
              confirmedPaymentReceiver: String(
                confirmedPayment?.receiver ?? "",
              ),
            },
          },
        },
        { status: 400 },
      );
    }

    const expectedPrefix = getVaultDepositNotePrefix(buyerAddress);
    if (!noteUtf8.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Deposit note does not match vault deposit format" },
        { status: 400 },
      );
    }

    if (!amountMicro || amountMicro <= 0) {
      return NextResponse.json(
        { error: "Deposit amount is invalid" },
        { status: 400 },
      );
    }

    const amountAlgo = Number((amountMicro / 1e6).toFixed(6));
    const account = await creditVault(buyerAddress, amountAlgo, txId);

    return NextResponse.json({
      success: true,
      amountAlgo,
      txId,
      account,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to credit vault";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
