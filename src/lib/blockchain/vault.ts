/**
 * Vault Wallet — a server-side managed wallet that AI agents auto-sign from.
 *
 * Users fund this address via their connected wallet.
 * During executeTransaction, if the vault has sufficient balance the
 * server signs and broadcasts autonomously — zero wallet popups.
 *
 * Key persistence priority:
 *   1. VAULT_PRIVATE_KEY in .env (base64, same format as AVM_PRIVATE_KEY)
 *   2. .vault-key file in project root (auto-persisted across dev hot-reloads)
 *   3. Auto-generate a new keypair, save to .vault-key
 */

import algosdk from "algosdk";
import { getClient, getBalance } from "./algorand";
import fs from "fs";
import path from "path";

let _vaultAccount: { addr: string; sk: Uint8Array } | null = null;

const VAULT_KEY_FILE = path.join(process.cwd(), ".vault-key");

/** Load the vault account with persistence across hot-reloads. */
function loadVault(): { addr: string; sk: Uint8Array } {
  if (_vaultAccount) return _vaultAccount;

  // Priority 1: env var
  const envKey = process.env.VAULT_PRIVATE_KEY;
  if (envKey) {
    const secretKey = Buffer.from(envKey, "base64");
    const mnemonic = algosdk.secretKeyToMnemonic(secretKey);
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    _vaultAccount = { addr: account.addr.toString(), sk: account.sk };
    console.log(`[VAULT] Loaded from VAULT_PRIVATE_KEY: ${_vaultAccount.addr}`);
    return _vaultAccount;
  }

  // Priority 2: persisted key file (survives dev hot-reloads)
  try {
    if (fs.existsSync(VAULT_KEY_FILE)) {
      const fileKey = fs.readFileSync(VAULT_KEY_FILE, "utf-8").trim();
      const secretKey = Buffer.from(fileKey, "base64");
      const mnemonic = algosdk.secretKeyToMnemonic(secretKey);
      const account = algosdk.mnemonicToSecretKey(mnemonic);
      _vaultAccount = { addr: account.addr.toString(), sk: account.sk };
      console.log(`[VAULT] Loaded from .vault-key: ${_vaultAccount.addr}`);
      return _vaultAccount;
    }
  } catch {
    // file not readable, generate new
  }

  // Priority 3: auto-generate and persist
  const account = algosdk.generateAccount();
  _vaultAccount = { addr: account.addr.toString(), sk: account.sk };
  const keyB64 = Buffer.from(account.sk).toString("base64");

  // Persist to file so it survives hot-reloads
  try {
    fs.writeFileSync(VAULT_KEY_FILE, keyB64, "utf-8");
  } catch {
    // write failed, key will be regenerated next time
  }

  console.log(`\n[VAULT] ═══════════════════════════════════════════════`);
  console.log(`[VAULT] Auto-generated vault wallet (persisted to .vault-key)`);
  console.log(`[VAULT] Address: ${account.addr.toString()}`);
  console.log(`[VAULT] To persist in .env, add:`);
  console.log(`[VAULT]   VAULT_PRIVATE_KEY=${keyB64}`);
  console.log(`[VAULT] ═══════════════════════════════════════════════\n`);

  return _vaultAccount;
}

/** Get the vault's Algorand address. */
export function getVaultAddress(): string {
  return loadVault().addr;
}

/** Get the vault's secret key (server-side only). */
export function getVaultSk(): Uint8Array {
  return loadVault().sk;
}

/** Get vault balance in ALGO using the same method as the rest of the app. */
export async function getVaultBalance(): Promise<number> {
  const addr = getVaultAddress();
  try {
    return await getBalance(addr);
  } catch {
    return 0;
  }
}

export async function getVaultSpendableAlgo(): Promise<number> {
  const vaultAddr = getVaultAddress();
  const algod = getClient().client.algod;
  try {
    const info = await algod.accountInformation(vaultAddr).do();
    const amount = Number(info.amount ?? 0);
    const minBalance = Number(info.minBalance ?? 0);
    // Keep a tiny fee/safety buffer to avoid mempool min-balance rejects.
    const spendableMicroAlgos = Math.max(0, amount - minBalance - 1_000);
    return spendableMicroAlgos / 1_000_000;
  } catch {
    return 0;
  }
}

/** Execute a payment from the vault (auto-signed). */
export async function vaultPayment(
  receiverAddress: string,
  amountAlgo: number,
  note?: string,
): Promise<{ txId: string; confirmedRound: number }> {
  const vault = loadVault();
  const algod = getClient().client.algod;
  const params = await algod.getTransactionParams().do();

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: algosdk.Address.fromString(vault.addr),
    receiver: algosdk.Address.fromString(receiverAddress),
    amount: Math.round(amountAlgo * 1_000_000),
    note: note ? new TextEncoder().encode(note) : undefined,
    suggestedParams: params,
  });

  const signed = txn.signTxn(vault.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const result = await algosdk.waitForConfirmation(algod, txid, 4);
  const confirmedRound = Number(result.confirmedRound ?? 0);

  return { txId: txid, confirmedRound };
}

/**
 * Auto-sign an arbitrary transaction with the vault key.
 * Used for reputation updates, ZK commits, etc.
 */
export async function vaultSignAndSubmit(
  unsignedTxnB64: string,
): Promise<{ txId: string; confirmedRound: number }> {
  const vault = loadVault();
  const algod = getClient().client.algod;

  const txnBytes = Buffer.from(unsignedTxnB64, "base64");
  const txn = algosdk.decodeUnsignedTransaction(txnBytes);
  const signed = txn.signTxn(vault.sk);

  const { txid } = await algod.sendRawTransaction(signed).do();
  const result = await algosdk.waitForConfirmation(algod, txid, 4);
  const confirmedRound = Number(result.confirmedRound ?? 0);

  return { txId: txid, confirmedRound };
}
