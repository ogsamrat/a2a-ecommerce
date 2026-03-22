import { AlgorandClient, algo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import type { EscrowState } from "@/lib/agents/types";

export type NetworkMode = "localnet" | "testnet";

export function getNetworkMode(): NetworkMode {
  const net = process.env.ALGORAND_NETWORK?.toLowerCase();
  return net === "testnet" ? "testnet" : "localnet";
}

export function isTestnet(): boolean {
  return getNetworkMode() === "testnet";
}

let algorandClient: AlgorandClient | null = null;

export function getClient(): AlgorandClient {
  if (!algorandClient) {
    if (isTestnet()) {
      algorandClient = AlgorandClient.testNet();
    } else {
      algorandClient = AlgorandClient.defaultLocalNet();
    }
  }
  return algorandClient;
}

export function getIndexer(): algosdk.Indexer {
  if (isTestnet()) {
    return new algosdk.Indexer("", "https://testnet-idx.algonode.cloud", "");
  }
  return new algosdk.Indexer("", "http://localhost", 8980);
}

interface AccountInfo {
  address: string;
  balance: number;
}

const TESTNET_MIN_BUYER_BALANCE_ALGO = 0.2;

let storedAccounts: {
  primaryAddr: string;
} | null = null;

let escrowState: EscrowState = {
  status: "idle",
  buyerAddress: "",
  sellerAddress: "",
  amount: 0,
  txId: "",
  confirmedRound: 0,
};

export async function getBalance(address: string): Promise<number> {
  const algorand = getClient();
  const info = await algorand.account.getInformation(address);
  return info.balance.algos;
}

function getTestnetAccountFromEnv(): ReturnType<
  typeof algosdk.mnemonicToSecretKey
> {
  const raw = process.env.AVM_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "AVM_PRIVATE_KEY is required when ALGORAND_NETWORK=testnet",
    );
  }

  // Support mnemonic input as a convenience for local setups.
  if (raw.includes(" ")) {
    return algosdk.mnemonicToSecretKey(raw);
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 64) {
    throw new Error(
      "AVM_PRIVATE_KEY must be base64 of a 64-byte Algorand secret key",
    );
  }

  const sk = Uint8Array.from(decoded);
  const addr = new algosdk.Address(sk.slice(32));
  return { addr, sk };
}

export async function initAccount(): Promise<{
  primary: AccountInfo;
}> {
  if (storedAccounts) {
    const primaryBal = await getBalance(storedAccounts.primaryAddr);
    return {
      primary: { address: storedAccounts.primaryAddr, balance: primaryBal },
    };
  }

  const algorand = getClient();

  let primaryAddr: string;

  if (isTestnet()) {
    const account = getTestnetAccountFromEnv();
    primaryAddr = account.addr.toString();
    algorand.setSignerFromAccount(account);

    const primaryBal = await getBalance(primaryAddr);
    if (primaryBal < TESTNET_MIN_BUYER_BALANCE_ALGO) {
      throw new Error(
        `Insufficient balance in AVM_PRIVATE_KEY account (${primaryBal.toFixed(6)} ALGO). ` +
          `Fund at least ${TESTNET_MIN_BUYER_BALANCE_ALGO} ALGO on TestNet to execute transactions.`,
      );
    }
  } else {
    const dispenser = await algorand.account.localNetDispenser();
    const primaryAccount = algorand.account.random();
    algorand.setSignerFromAccount(primaryAccount);
    await algorand.send.payment({
      sender: dispenser.addr,
      receiver: primaryAccount.addr,
      amount: algo(5000),
    });
    primaryAddr = primaryAccount.addr.toString();
  }

  const primaryBal = await getBalance(primaryAddr);
  storedAccounts = { primaryAddr };

  return {
    primary: { address: primaryAddr, balance: primaryBal },
  };
}

export function getStoredAccounts() {
  return storedAccounts;
}

function ensureBuyerAccountForExecution(): string {
  const algorand = getClient();

  if (storedAccounts?.primaryAddr) {
    // Ensure the signer is configured on this process before sending.
    if (isTestnet()) {
      const account = getTestnetAccountFromEnv();
      algorand.setSignerFromAccount(account);
    }
    return storedAccounts.primaryAddr;
  }

  if (isTestnet()) {
    // Recover gracefully when /api/init returned a warning and did not cache accounts.
    const account = getTestnetAccountFromEnv();
    algorand.setSignerFromAccount(account);
    const primaryAddr = account.addr.toString();
    storedAccounts = { primaryAddr };
    return primaryAddr;
  }

  throw new Error("Account not initialized");
}

export async function executePayment(
  sellerAddress: string,
  amountAlgo: number,
  note?: string,
): Promise<EscrowState> {
  const algorand = getClient();
  const buyerAddr = ensureBuyerAccountForExecution();
  const buyerBal = await getBalance(buyerAddr);
  if (buyerBal < amountAlgo + 0.1) {
    throw new Error(
      `Insufficient balance: ${buyerBal.toFixed(2)} ALGO < ${amountAlgo + 0.1} ALGO needed`,
    );
  }

  const result = await algorand.send.payment({
    sender: buyerAddr,
    receiver: sellerAddress,
    amount: algo(amountAlgo),
    note: note
      ? String(note).slice(0, 900)
      : `AgentDEX Payment | ${amountAlgo} ALGO`,
  });

  const txId = result.txIds[0];
  const confirmedRound = Number(result.confirmation.confirmedRound ?? 0n);

  escrowState = {
    status: "released",
    buyerAddress: buyerAddr,
    sellerAddress,
    amount: amountAlgo,
    txId,
    confirmedRound,
  };

  return { ...escrowState };
}

export async function executeAutonomousTransfer(
  receiverAddress: string,
  amountAlgo: number,
  note?: string,
): Promise<{
  txId: string;
  confirmedRound: number;
  senderAddress: string;
  receiverAddress: string;
  amountAlgo: number;
}> {
  const algorand = getClient();
  const senderAddress = ensureBuyerAccountForExecution();
  const senderBal = await getBalance(senderAddress);
  if (senderBal < amountAlgo + 0.1) {
    throw new Error(
      `Insufficient autonomous balance: ${senderBal.toFixed(2)} ALGO < ${amountAlgo + 0.1} ALGO needed`,
    );
  }

  const result = await algorand.send.payment({
    sender: senderAddress,
    receiver: receiverAddress,
    amount: algo(amountAlgo),
    note: note
      ? String(note).slice(0, 900)
      : `A2A Vault Withdrawal | ${amountAlgo} ALGO`,
  });

  return {
    txId: result.txIds[0],
    confirmedRound: Number(result.confirmation.confirmedRound ?? 0n),
    senderAddress,
    receiverAddress,
    amountAlgo,
  };
}

export function getEscrowState(): EscrowState {
  return { ...escrowState };
}

export function resetState(): void {
  escrowState = {
    status: "idle",
    buyerAddress: "",
    sellerAddress: "",
    amount: 0,
    txId: "",
    confirmedRound: 0,
  };
  storedAccounts = null;
  algorandClient = null;
}
