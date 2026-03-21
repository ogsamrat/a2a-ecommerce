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

interface TransactionResult {
  txId: string;
  confirmedRound: number;
}

let storedAccounts: {
  buyerAddr: string;
  sellerAddrs: Record<string, string>;
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

export async function initAccounts(): Promise<{
  buyer: AccountInfo;
  sellers: Record<string, AccountInfo>;
}> {
  if (storedAccounts) {
    const sellerAccounts: Record<string, AccountInfo> = {};
    for (const [name, addr] of Object.entries(storedAccounts.sellerAddrs)) {
      const bal = await getBalance(addr);
      sellerAccounts[name] = { address: addr, balance: bal };
    }
    const buyerBal = await getBalance(storedAccounts.buyerAddr);
    return {
      buyer: { address: storedAccounts.buyerAddr, balance: buyerBal },
      sellers: sellerAccounts,
    };
  }

  const algorand = getClient();

  let buyerAddr: string;

  if (isTestnet()) {
    const account = getTestnetAccountFromEnv();
    buyerAddr = account.addr.toString();
    algorand.setSignerFromAccount(account);
  } else {
    const dispenser = await algorand.account.localNetDispenser();
    const buyerAccount = algorand.account.random();
    algorand.setSignerFromAccount(buyerAccount);
    await algorand.send.payment({
      sender: dispenser.addr,
      receiver: buyerAccount.addr,
      amount: algo(5000),
    });
    buyerAddr = buyerAccount.addr.toString();
  }

  const sellerNames = [
    "cloudmax",
    "datavault",
    "quickapi",
    "bharatcompute",
    "securehost",
  ];
  const sellerAccounts: Record<string, AccountInfo> = {};
  const sellerAddrs: Record<string, string> = {};

  if (isTestnet()) {
    for (const name of sellerNames) {
      const sellerAccount = algorand.account.random();
      algorand.setSignerFromAccount(sellerAccount);
      await algorand.send.payment({
        sender: buyerAddr,
        receiver: sellerAccount.addr,
        amount: algo(0.5),
      });
      const bal = await getBalance(sellerAccount.addr.toString());
      sellerAccounts[name] = {
        address: sellerAccount.addr.toString(),
        balance: bal,
      };
      sellerAddrs[name] = sellerAccount.addr.toString();
    }
  } else {
    const dispenser = await algorand.account.localNetDispenser();
    for (const name of sellerNames) {
      const sellerAccount = algorand.account.random();
      algorand.setSignerFromAccount(sellerAccount);
      await algorand.send.payment({
        sender: dispenser.addr,
        receiver: sellerAccount.addr,
        amount: algo(100),
      });
      const bal = await getBalance(sellerAccount.addr.toString());
      sellerAccounts[name] = {
        address: sellerAccount.addr.toString(),
        balance: bal,
      };
      sellerAddrs[name] = sellerAccount.addr.toString();
    }
  }

  const buyerBal = await getBalance(buyerAddr);
  storedAccounts = { buyerAddr, sellerAddrs };

  return {
    buyer: { address: buyerAddr, balance: buyerBal },
    sellers: sellerAccounts,
  };
}

export function getStoredAccounts() {
  return storedAccounts;
}

export async function executePayment(
  sellerAddress: string,
  amountAlgo: number,
): Promise<EscrowState> {
  const algorand = getClient();
  if (!storedAccounts) throw new Error("Accounts not initialized");

  const { buyerAddr } = storedAccounts;
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
    note: `AgentDEX Payment | ${amountAlgo} ALGO`,
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
