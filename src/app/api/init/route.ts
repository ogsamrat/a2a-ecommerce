import { NextResponse } from "next/server";
import algosdk from "algosdk";
import {
  initAccounts,
  getNetworkMode,
  getStoredAccounts,
  getBalance,
  shouldSeedDemoSellers,
} from "@/lib/blockchain/algorand";
import {
  postListingsOnChain,
  fetchPublicListings,
} from "@/lib/blockchain/listings";
import { seedAgentReputations } from "@/lib/blockchain/reputation";
import { createAction } from "@/lib/a2a/messaging";

export async function POST() {
  try {
    const network = getNetworkMode();
    const networkLabel =
      network === "testnet" ? "Algorand TestNet" : "Algorand LocalNet";
    const seedDemoSellers = shouldSeedDemoSellers();
    const actions = [
      createAction(
        "system",
        "Algorand",
        "transaction",
        `Connecting to ${networkLabel}...`,
      ),
    ];

    // ── Idempotency: skip account creation if already in memory ─────────────
    const existingAccounts = getStoredAccounts();
    if (existingAccounts) {
      actions.push(
        createAction(
          "system",
          "Algorand",
          "transaction",
          `Accounts already in memory — checking on-chain listings...`,
        ),
      );

      const existingListings = await fetchPublicListings();

      if (existingListings.length >= 5) {
        // Fully initialized — nothing to do
        const buyerBal = await getBalance(existingAccounts.buyerAddr);
        actions.push(
          createAction(
            "system",
            "Algorand",
            "result",
            `Already fully initialized.\n` +
              `• **Buyer:** \`${existingAccounts.buyerAddr.slice(0, 12)}...\` (${buyerBal.toFixed(3)} ALGO)\n` +
              `• **Sellers:** ${Object.keys(existingAccounts.sellerAddrs).join(", ")}\n` +
              `• **On-chain listings:** ${existingListings.length} found — skipping re-seed.`,
          ),
        );
        return NextResponse.json({
          success: true,
          alreadyInitialized: true,
          message: `${existingListings.length} listings already on-chain. Skipped re-init.`,
          accounts: {
            buyer: { address: existingAccounts.buyerAddr, balance: buyerBal },
            sellers: Object.fromEntries(
              Object.entries(existingAccounts.sellerAddrs).map(([k, v]) => [
                k,
                { address: v, balance: 0 },
              ]),
            ),
          },
          listingTxIds: existingListings.map((l) => l.txId),
          actions,
        });
      }

      // Accounts exist but listings are gone — only post listings
      if (
        Object.keys(existingAccounts.sellerAddrs).length === 0 ||
        !seedDemoSellers
      ) {
        const buyerBalNoSeller = await getBalance(existingAccounts.buyerAddr);
        actions.push(
          createAction(
            "system",
            "Algorand",
            "result",
            "Init completed in buyer-only mode. Demo sellers/listings are disabled on TestNet.",
          ),
        );
        return NextResponse.json({
          success: true,
          buyerOnlyMode: true,
          message:
            "Buyer account ready. Demo sellers/listings were skipped (set A2A_INIT_DEMO_SELLERS=true to enable).",
          accounts: {
            buyer: {
              address: existingAccounts.buyerAddr,
              balance: buyerBalNoSeller,
            },
            sellers: {},
          },
          listingTxIds: [],
          actions,
        });
      }

      actions.push(
        createAction(
          "system",
          "Algorand",
          "transaction",
          `Accounts found but only ${existingListings.length} listings on-chain — re-posting...`,
        ),
      );
      const listingTxIds = await postListingsOnChain();
      actions.push(
        createAction(
          "system",
          "Algorand",
          "result",
          `**${listingTxIds.length} listings** re-posted on-chain.`,
          { listingTxIds },
        ),
      );
      const buyerBal2 = await getBalance(existingAccounts.buyerAddr);
      return NextResponse.json({
        success: true,
        onlyListingsPosted: true,
        accounts: {
          buyer: { address: existingAccounts.buyerAddr, balance: buyerBal2 },
          sellers: Object.fromEntries(
            Object.entries(existingAccounts.sellerAddrs).map(([k, v]) => [
              k,
              { address: v, balance: 0 },
            ]),
          ),
        },
        listingTxIds,
        actions,
      });
    }

    // ── Fresh init ────────────────────────────────────────────────────────────
    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        seedDemoSellers
          ? `Creating buyer + 5 seller accounts on ${networkLabel}...`
          : `Creating buyer account on ${networkLabel} (demo sellers disabled)...`,
      ),
    );

    const accounts = await initAccounts();
    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        `Accounts ready on ${networkLabel}:\n` +
          `• **Buyer:** \`${accounts.buyer.address.slice(0, 12)}...${accounts.buyer.address.slice(-6)}\` (${accounts.buyer.balance.toFixed(3)} ALGO)\n` +
          `• **Sellers:** ${Object.keys(accounts.sellers).join(", ")}`,
        { accounts },
      ),
    );

    let listingTxIds: string[] = [];
    if (seedDemoSellers && Object.keys(accounts.sellers).length > 0) {
      // ── Post listings ───────────────────────────────────────────────────────
      actions.push(
        createAction(
          "system",
          "Algorand",
          "transaction",
          "Posting 5 service listings on-chain via 0 ALGO transactions with ZK commitments...",
        ),
      );
      listingTxIds = await postListingsOnChain();
      actions.push(
        createAction(
          "system",
          "Algorand",
          "result",
          `**${listingTxIds.length} listings** posted on-chain!\n` +
            listingTxIds
              .map((tx, i) => `• Listing ${i + 1}: \`${tx.slice(0, 20)}...\``)
              .join("\n"),
          { listingTxIds },
        ),
      );
    } else {
      actions.push(
        createAction(
          "system",
          "Algorand",
          "result",
          "Demo seller/listing bootstrap skipped to preserve TestNet ALGO. Set A2A_INIT_DEMO_SELLERS=true to enable.",
        ),
      );
    }

    // ── Seed reputations in background (non-blocking) ─────────────────────────
    // Run fire-and-forget so init returns after listings are posted (~40s total)
    if (process.env.AVM_PRIVATE_KEY && listingTxIds.length > 0) {
      try {
        const secretKey = Buffer.from(process.env.AVM_PRIVATE_KEY, "base64");
        const acct = algosdk.mnemonicToSecretKey(
          algosdk.secretKeyToMnemonic(secretKey),
        );
        const buyerSk = acct.sk;
        const buyerAddr = accounts.buyer.address;
        seedAgentReputations(buyerAddr, buyerSk)
          .then(() => {
            globalThis.__a2aReputationsSeeded = true;
          })
          .catch((e) =>
            console.error("[reputation] background seeding failed:", e),
          );
      } catch (e) {
        console.error("[reputation] Could not start background seeding:", e);
      }
    }

    actions.push(
      createAction(
        "system",
        "Algorand",
        "result",
        listingTxIds.length > 0
          ? "Reputation seeding started in background. Agents will be registered momentarily."
          : "Reputation seeding skipped because demo listings were not created.",
      ),
    );

    return NextResponse.json({
      success: true,
      accounts,
      listingTxIds,
      reputationResults: [],
      reputationError: null,
      actions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Init failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
