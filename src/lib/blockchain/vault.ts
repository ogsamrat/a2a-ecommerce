import { promises as fs } from "fs";
import path from "path";

export interface VaultPolicy {
  maxPerOrderAlgo: number;
  dailyCapAlgo: number;
  allowedSellers: string[];
  allowedServices: string[];
  expiresAt?: string;
}

export interface VaultAccount {
  buyerAddress: string;
  balanceAlgo: number;
  policy: VaultPolicy;
  usageByDay: Record<string, number>;
  creditedTxIds: string[];
  updatedAt: string;
}

interface VaultLedger {
  accounts: Record<string, VaultAccount>;
}

const LEDGER_PATH = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "vault-ledger.json",
);

const DEFAULT_POLICY: VaultPolicy = {
  maxPerOrderAlgo: 1,
  dailyCapAlgo: 5,
  allowedSellers: [],
  allowedServices: [],
};

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function normalizePolicy(input?: Partial<VaultPolicy>): VaultPolicy {
  const maxPerOrderAlgo = Number(
    input?.maxPerOrderAlgo ?? DEFAULT_POLICY.maxPerOrderAlgo,
  );
  const dailyCapAlgo = Number(
    input?.dailyCapAlgo ?? DEFAULT_POLICY.dailyCapAlgo,
  );

  return {
    maxPerOrderAlgo:
      Number.isFinite(maxPerOrderAlgo) && maxPerOrderAlgo > 0
        ? maxPerOrderAlgo
        : DEFAULT_POLICY.maxPerOrderAlgo,
    dailyCapAlgo:
      Number.isFinite(dailyCapAlgo) && dailyCapAlgo > 0
        ? dailyCapAlgo
        : DEFAULT_POLICY.dailyCapAlgo,
    allowedSellers: (input?.allowedSellers ?? []).filter(Boolean),
    allowedServices: (input?.allowedServices ?? [])
      .filter(Boolean)
      .map((s) => s.toLowerCase()),
    expiresAt: input?.expiresAt,
  };
}

async function ensureLedgerFile(): Promise<void> {
  await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  try {
    await fs.access(LEDGER_PATH);
  } catch {
    const initial: VaultLedger = { accounts: {} };
    await fs.writeFile(LEDGER_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readLedger(): Promise<VaultLedger> {
  await ensureLedgerFile();
  const raw = await fs.readFile(LEDGER_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as VaultLedger;
    if (!parsed.accounts) return { accounts: {} };
    return parsed;
  } catch {
    return { accounts: {} };
  }
}

async function writeLedger(ledger: VaultLedger): Promise<void> {
  await ensureLedgerFile();
  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

function makeDefaultAccount(buyerAddress: string): VaultAccount {
  return {
    buyerAddress,
    balanceAlgo: 0,
    policy: { ...DEFAULT_POLICY },
    usageByDay: {},
    creditedTxIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getVaultAccount(
  buyerAddress: string,
): Promise<VaultAccount> {
  const ledger = await readLedger();
  const existing = ledger.accounts[buyerAddress];
  if (existing) return existing;

  const created = makeDefaultAccount(buyerAddress);
  ledger.accounts[buyerAddress] = created;
  await writeLedger(ledger);
  return created;
}

export async function updateVaultPolicy(
  buyerAddress: string,
  policyPatch: Partial<VaultPolicy>,
): Promise<VaultAccount> {
  const ledger = await readLedger();
  const current =
    ledger.accounts[buyerAddress] ?? makeDefaultAccount(buyerAddress);

  current.policy = normalizePolicy({ ...current.policy, ...policyPatch });
  current.updatedAt = new Date().toISOString();

  ledger.accounts[buyerAddress] = current;
  await writeLedger(ledger);
  return current;
}

export async function creditVault(
  buyerAddress: string,
  amountAlgo: number,
  txId: string,
): Promise<VaultAccount> {
  if (!Number.isFinite(amountAlgo) || amountAlgo <= 0) {
    throw new Error("Vault credit amount must be positive");
  }

  const ledger = await readLedger();
  const account =
    ledger.accounts[buyerAddress] ?? makeDefaultAccount(buyerAddress);

  if (account.creditedTxIds.includes(txId)) {
    throw new Error("Deposit transaction already credited");
  }

  account.balanceAlgo = Number((account.balanceAlgo + amountAlgo).toFixed(6));
  account.creditedTxIds.push(txId);
  account.updatedAt = new Date().toISOString();

  ledger.accounts[buyerAddress] = account;
  await writeLedger(ledger);
  return account;
}

export interface SpendCheckInput {
  buyerAddress: string;
  amountAlgo: number;
  sellerAddress: string;
  service: string;
}

export interface SpendCheckResult {
  ok: boolean;
  reason?: string;
  account: VaultAccount;
  projectedDailySpendAlgo?: number;
}

export async function canSpendFromVault(
  input: SpendCheckInput,
): Promise<SpendCheckResult> {
  const account = await getVaultAccount(input.buyerAddress);
  const policy = account.policy;
  const amount = Number(input.amountAlgo);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Invalid spend amount", account };
  }

  if (amount > account.balanceAlgo) {
    return {
      ok: false,
      reason: `Vault balance too low (${account.balanceAlgo.toFixed(6)} ALGO)`,
      account,
    };
  }

  if (amount > policy.maxPerOrderAlgo) {
    return {
      ok: false,
      reason: `Amount exceeds max per order (${policy.maxPerOrderAlgo} ALGO)`,
      account,
    };
  }

  if (
    policy.allowedSellers.length > 0 &&
    !policy.allowedSellers.includes(input.sellerAddress)
  ) {
    return {
      ok: false,
      reason: "Seller is not allow-listed by vault policy",
      account,
    };
  }

  if (
    policy.allowedServices.length > 0 &&
    !policy.allowedServices.includes(input.service.toLowerCase())
  ) {
    return {
      ok: false,
      reason: "Service is not allow-listed by vault policy",
      account,
    };
  }

  if (policy.expiresAt) {
    const expiresAt = new Date(policy.expiresAt).getTime();
    if (!Number.isNaN(expiresAt) && Date.now() > expiresAt) {
      return {
        ok: false,
        reason: "Vault policy has expired",
        account,
      };
    }
  }

  const day = todayKey();
  const spentToday = Number(account.usageByDay[day] ?? 0);
  const projected = Number((spentToday + amount).toFixed(6));

  if (projected > policy.dailyCapAlgo) {
    return {
      ok: false,
      reason: `Daily cap exceeded (${policy.dailyCapAlgo} ALGO/day)`,
      account,
      projectedDailySpendAlgo: projected,
    };
  }

  return { ok: true, account, projectedDailySpendAlgo: projected };
}

export async function debitVault(
  input: SpendCheckInput,
): Promise<VaultAccount> {
  const check = await canSpendFromVault(input);
  if (!check.ok) {
    throw new Error(check.reason ?? "Vault policy rejected spend");
  }

  const ledger = await readLedger();
  const account =
    ledger.accounts[input.buyerAddress] ??
    makeDefaultAccount(input.buyerAddress);
  const day = todayKey();
  const spentToday = Number(account.usageByDay[day] ?? 0);

  account.balanceAlgo = Number(
    (account.balanceAlgo - input.amountAlgo).toFixed(6),
  );
  account.usageByDay[day] = Number((spentToday + input.amountAlgo).toFixed(6));
  account.updatedAt = new Date().toISOString();

  ledger.accounts[input.buyerAddress] = account;
  await writeLedger(ledger);
  return account;
}

export function getVaultDepositNotePrefix(buyerAddress: string): string {
  return `A2A_VAULT_DEPOSIT:${buyerAddress}`;
}
