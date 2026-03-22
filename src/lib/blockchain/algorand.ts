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

export function shouldSeedDemoSellers(): boolean {
  if (!isTestnet()) return true;
  const raw = process.env.A2A_INIT_DEMO_SELLERS?.toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes";
}

// Use globalThis so state persists across Next.js route module instances in dev mode
declare global {
  // eslint-disable-next-line no-var
  var __a2aAlgorandClient: AlgorandClient | undefined;
  // eslint-disable-next-line no-var
  var __a2aStoredAccounts: {
    buyerAddr: string;
    sellerAddrs: Record<string, string>;
  } | null;
  // eslint-disable-next-line no-var
  var __a2aSellerKeys: Record<string, { sk: Uint8Array; addr: string }> | null;
  // eslint-disable-next-line no-var
  var __a2aEscrowState: EscrowState | undefined;
  // eslint-disable-next-line no-var
  var __a2aReputationsSeeded: boolean;
}

export function getClient(): AlgorandClient {
  if (!globalThis.__a2aAlgorandClient) {
    globalThis.__a2aAlgorandClient = isTestnet()
      ? AlgorandClient.testNet()
      : AlgorandClient.defaultLocalNet();
  }
  return globalThis.__a2aAlgorandClient;
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

const MICROALGOS_PER_ALGO = 1_000_000;
const DEFAULT_TX_FEE_MICROALGOS = 1_000;
const SELLER_TARGET_FUNDING_MICROALGOS = 500_000; // 0.5 ALGO
const SELLER_MIN_BOOTSTRAP_MICROALGOS = 120_000; // 0.12 ALGO keeps room above min-balance + fee
const BUYER_SAFETY_BUFFER_MICROALGOS = 10_000;

if (globalThis.__a2aStoredAccounts === undefined)
  globalThis.__a2aStoredAccounts = null;
if (globalThis.__a2aSellerKeys === undefined) globalThis.__a2aSellerKeys = null;
if (globalThis.__a2aReputationsSeeded === undefined)
  globalThis.__a2aReputationsSeeded = false;
if (!globalThis.__a2aEscrowState) {
  globalThis.__a2aEscrowState = {
    status: "idle",
    buyerAddress: "",
    sellerAddress: "",
    amount: 0,
    txId: "",
    confirmedRound: 0,
  };
}

// Prefixed starting reputation scores for each seller agent
export const SELLER_INITIAL_REPUTATIONS: Record<string, number> = {
  cloudmax: 82, // enterprise, reliable, premium pricing
  datavault: 78, // good SME option, slightly slower support
  quickapi: 91, // excellent latency, top-tier developer experience
  bharatcompute: 85, // solid GPU infra, spot pricing variance
  securehost: 88, // strong security posture, consistent uptime
};

export async function getBalance(address: string): Promise<number> {
  const algorand = getClient();
  const info = await algorand.account.getInformation(address);
  return info.balance.algos;
}

async function getAccountSpendableMicroAlgos(address: string): Promise<{
  amount: number;
  minBalance: number;
  spendable: number;
}> {
  const algorand = getClient();
  const info = await algorand.client.algod.accountInformation(address).do();
  const amount = Number(info.amount ?? 0);
  const minBalance = Number(info.minBalance ?? 0);
  const spendable = Math.max(
    0,
    amount - minBalance - BUYER_SAFETY_BUFFER_MICROALGOS,
  );
  return { amount, minBalance, spendable };
}

export async function initAccounts(): Promise<{
  buyer: AccountInfo;
  sellers: Record<string, AccountInfo>;
}> {
  const algorand = getClient();
  const seedDemoSellers = shouldSeedDemoSellers();

  let buyerAddr: string;

  if (isTestnet() && process.env.AVM_PRIVATE_KEY) {
    const secretKey = Buffer.from(process.env.AVM_PRIVATE_KEY, "base64");
    const account = algosdk.mnemonicToSecretKey(
      algosdk.secretKeyToMnemonic(secretKey),
    );
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

  const sellerKeys: Record<string, { sk: Uint8Array; addr: string }> = {};

  if (isTestnet() && seedDemoSellers) {
    const sellerCount = sellerNames.length;
    const totalBuyerFeeReserve = sellerCount * DEFAULT_TX_FEE_MICROALGOS;
    const buyerState = await getAccountSpendableMicroAlgos(buyerAddr);
    const allocatable = Math.max(
      0,
      buyerState.spendable - totalBuyerFeeReserve,
    );
    const adaptivePerSellerFunding = Math.floor(allocatable / sellerCount);
    const perSellerFundingMicroAlgos = Math.min(
      SELLER_TARGET_FUNDING_MICROALGOS,
      adaptivePerSellerFunding,
    );

    if (perSellerFundingMicroAlgos < SELLER_MIN_BOOTSTRAP_MICROALGOS) {
      const required =
        sellerCount *
        (SELLER_MIN_BOOTSTRAP_MICROALGOS + DEFAULT_TX_FEE_MICROALGOS);
      const requiredAlgo = (required / MICROALGOS_PER_ALGO).toFixed(6);
      const availableAlgo = (
        buyerState.spendable / MICROALGOS_PER_ALGO
      ).toFixed(6);
      throw new Error(
        `Buyer wallet has insufficient spendable balance for TestNet init. ` +
          `Available spendable: ${availableAlgo} ALGO, required: at least ${requiredAlgo} ALGO. ` +
          `Please top up the buyer wallet (AVM_PRIVATE_KEY account) from the Algorand TestNet faucet and retry.`,
      );
    }

    for (const name of sellerNames) {
      const rawAcct = algosdk.generateAccount();
      const sellerAddr = rawAcct.addr.toString();
      await algorand.send.payment({
        sender: buyerAddr,
        receiver: sellerAddr,
        amount: algo(perSellerFundingMicroAlgos / MICROALGOS_PER_ALGO),
      });
      const bal = await getBalance(sellerAddr);
      sellerAccounts[name] = { address: sellerAddr, balance: bal };
      sellerAddrs[name] = sellerAddr;
      sellerKeys[name] = { sk: rawAcct.sk, addr: sellerAddr };
    }
  } else if (!isTestnet()) {
    const dispenser = await algorand.account.localNetDispenser();
    for (const name of sellerNames) {
      const rawAcct = algosdk.generateAccount();
      const sellerAddr = rawAcct.addr.toString();
      await algorand.send.payment({
        sender: dispenser.addr,
        receiver: sellerAddr,
        amount: algo(100),
      });
      const bal = await getBalance(sellerAddr);
      sellerAccounts[name] = { address: sellerAddr, balance: bal };
      sellerAddrs[name] = sellerAddr;
      sellerKeys[name] = { sk: rawAcct.sk, addr: sellerAddr };
    }
  }

  const buyerBal = await getBalance(buyerAddr);
  globalThis.__a2aStoredAccounts = { buyerAddr, sellerAddrs };
  globalThis.__a2aSellerKeys = sellerKeys;
  globalThis.__a2aReputationsSeeded = false; // reset so init can re-seed

  return {
    buyer: { address: buyerAddr, balance: buyerBal },
    sellers: sellerAccounts,
  };
}

export function getStoredAccounts() {
  return globalThis.__a2aStoredAccounts ?? null;
}

export function getSellerKeys() {
  return globalThis.__a2aSellerKeys ?? null;
}

/** Read agent reputation box from on-chain. Returns null if not registered. */
export async function queryAgentReputation(agentAddress: string): Promise<{
  isRegistered: boolean;
  reputation: number;
  feedbackCount: number;
  totalScore: number;
} | null> {
  const appId = process.env.REPUTATION_APP_ID;
  if (!appId) return null;
  try {
    const algod = getClient().client.algod;
    const boxName = Buffer.concat([
      Buffer.from("a"),
      algosdk.decodeAddress(agentAddress).publicKey,
    ]);
    const box = await algod
      .getApplicationBoxByName(BigInt(appId), boxName)
      .do();
    const raw = box.value;
    // AgentProfile layout: totalScore(8) | feedbackCount(8) | registeredAt(8) | isActive(8)
    const view = new DataView(raw.buffer, raw.byteOffset);
    const totalScore = Number(view.getBigUint64(0));
    const feedbackCount = Number(view.getBigUint64(8));
    // Scores are 0-100; average gives 0-100 reputation (same logic as contract's getReputation/SCALE)
    const reputation =
      feedbackCount > 0 ? Math.round(totalScore / feedbackCount) : 0;
    return { isRegistered: true, reputation, feedbackCount, totalScore };
  } catch {
    return {
      isRegistered: false,
      reputation: 0,
      feedbackCount: 0,
      totalScore: 0,
    };
  }
}

export async function executePayment(
  sellerAddress: string,
  amountAlgo: number,
): Promise<EscrowState> {
  const algorand = getClient();
  const storedAccounts = globalThis.__a2aStoredAccounts;
  if (!storedAccounts) throw new Error("Accounts not initialized");

  const { buyerAddr } = storedAccounts;
  const amountMicroAlgos = Math.floor(amountAlgo * MICROALGOS_PER_ALGO);
  const buyerState = await getAccountSpendableMicroAlgos(buyerAddr);
  const requiredMicroAlgos = amountMicroAlgos + DEFAULT_TX_FEE_MICROALGOS;
  if (buyerState.spendable < requiredMicroAlgos) {
    const spendableAlgo = (buyerState.spendable / MICROALGOS_PER_ALGO).toFixed(
      6,
    );
    const requiredAlgo = (requiredMicroAlgos / MICROALGOS_PER_ALGO).toFixed(6);
    throw new Error(
      `Insufficient spendable balance: ${spendableAlgo} ALGO available, ${requiredAlgo} ALGO required. ` +
        `Top up the buyer wallet and retry.`,
    );
  }

  const result = await algorand.send.payment({
    sender: buyerAddr,
    receiver: sellerAddress,
    amount: algo(amountAlgo),
    note: `A2A Commerce Payment | ${amountAlgo} ALGO`,
  });

  const txId = result.txIds[0];
  const confirmedRound = Number(result.confirmation.confirmedRound ?? 0n);

  globalThis.__a2aEscrowState = {
    status: "released",
    buyerAddress: buyerAddr,
    sellerAddress,
    amount: amountAlgo,
    txId,
    confirmedRound,
  };

  return { ...globalThis.__a2aEscrowState };
}

export function getEscrowState(): EscrowState {
  return {
    ...(globalThis.__a2aEscrowState ?? {
      status: "idle",
      buyerAddress: "",
      sellerAddress: "",
      amount: 0,
      txId: "",
      confirmedRound: 0,
    }),
  };
}

export function resetState(): void {
  globalThis.__a2aEscrowState = {
    status: "idle",
    buyerAddress: "",
    sellerAddress: "",
    amount: 0,
    txId: "",
    confirmedRound: 0,
  };
  globalThis.__a2aStoredAccounts = null;
  globalThis.__a2aSellerKeys = null;
  globalThis.__a2aReputationsSeeded = false;
  globalThis.__a2aAlgorandClient = undefined;
}
