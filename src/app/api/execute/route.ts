import { NextRequest, NextResponse } from "next/server";
import { executePayment, getBalance } from "@/lib/blockchain/algorand";
import { createAction } from "@/lib/a2a/messaging";
import type { NegotiationSession } from "@/lib/agents/types";
import { canSpendFromVault, debitVault } from "@/lib/blockchain/vault";

export async function POST(req: NextRequest) {
  try {
    const { deal, buyerAddress, autoBuy } = (await req.json()) as {
      deal: NegotiationSession;
      buyerAddress?: string;
      autoBuy?: boolean;
    };

    if (!deal?.sellerAddress || !deal?.finalPrice) {
      return NextResponse.json(
        { error: "Deal details are required" },
        { status: 400 },
      );
    }

    if (autoBuy) {
      if (!buyerAddress) {
        return NextResponse.json(
          { error: "buyerAddress is required for Auto-Buy vault execution" },
          { status: 400 },
        );
      }

      const spendCheck = await canSpendFromVault({
        buyerAddress,
        amountAlgo: deal.finalPrice,
        sellerAddress: deal.sellerAddress,
        service: deal.service,
      });

      if (!spendCheck.ok) {
        return NextResponse.json(
          {
            error: `Vault policy check failed: ${spendCheck.reason}`,
            vault: spendCheck.account,
          },
          { status: 400 },
        );
      }
    }

    const actions = [
      createAction(
        "buyer",
        "Buyer Agent",
        "transaction",
        `Executing real payment on Algorand...\n**${deal.finalPrice} ALGO** to **${deal.sellerName}** (\`${deal.sellerAddress.slice(0, 12)}...\`)`,
      ),
    ];

    const orderNote =
      "a2a-order:" +
      JSON.stringify({
        v: 1,
        listingTxId: deal.listingTxId,
        buyer: buyerAddress ?? "",
        seller: deal.sellerAddress,
        type: "unknown",
        service: deal.service,
        price: deal.finalPrice,
        description: "",
        deliveryKind: "other",
        createdAt: Date.now(),
      });

    const escrow = await executePayment(
      deal.sellerAddress,
      deal.finalPrice,
      orderNote,
    );

    const buyerBal = await getBalance(escrow.buyerAddress);
    const sellerBal = await getBalance(escrow.sellerAddress);

    let vaultAfterDebit: Awaited<ReturnType<typeof debitVault>> | null = null;
    let vaultWarning: string | null = null;
    if (autoBuy && buyerAddress) {
      try {
        vaultAfterDebit = await debitVault({
          buyerAddress,
          amountAlgo: deal.finalPrice,
          sellerAddress: deal.sellerAddress,
          service: deal.service,
        });
      } catch (e) {
        vaultWarning =
          e instanceof Error
            ? e.message
            : "Vault debit bookkeeping failed after successful payment";
      }
    }

    actions.push(
      createAction(
        "system",
        "Algorand",
        "transaction",
        `**Payment Confirmed On-Chain!**\n` +
          `• **TX ID:** \`${escrow.txId}\`\n` +
          `• **Confirmed Round:** ${escrow.confirmedRound}\n` +
          `• **Amount:** ${escrow.amount} ALGO\n` +
          `• **Buyer Balance:** ${buyerBal.toFixed(4)} ALGO\n` +
          `• **Seller Balance:** ${sellerBal.toFixed(4)} ALGO`,
        { escrow, buyerBal, sellerBal },
      ),
    );

    if (vaultAfterDebit) {
      actions.push(
        createAction(
          "system",
          "Vault",
          "transaction",
          `Vault debited **${deal.finalPrice} ALGO**. Remaining buyer vault balance: **${vaultAfterDebit.balanceAlgo.toFixed(6)} ALGO**.`,
          { vault: vaultAfterDebit },
        ),
      );
    } else if (vaultWarning) {
      actions.push(
        createAction(
          "system",
          "Vault",
          "result",
          `Payment succeeded but vault ledger update needs review: ${vaultWarning}`,
        ),
      );
    }

    actions.push(
      createAction(
        "buyer",
        "Buyer Agent",
        "result",
        `Transaction complete! **${deal.finalPrice} ALGO** paid to **${deal.sellerName}** for "${deal.service}".\n\n` +
          `**Payment TX:** \`${escrow.txId}\`\n` +
          `**Listing TX:** \`${deal.listingTxId.slice(0, 20)}...\``,
      ),
    );

    return NextResponse.json({
      success: true,
      escrow,
      actions,
      vault: vaultAfterDebit,
      vaultWarning,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
