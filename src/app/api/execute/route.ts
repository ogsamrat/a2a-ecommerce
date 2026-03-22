import { NextRequest, NextResponse } from "next/server";
import { executePayment, getBalance } from "@/lib/blockchain/algorand";
import { createAction } from "@/lib/a2a/messaging";
import type { NegotiationSession } from "@/lib/agents/types";
import { canSpendFromVault, holdVaultFunds } from "@/lib/blockchain/vault";
import { fetchListingByTxId } from "@/lib/blockchain/listings";

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

    const listing = await fetchListingByTxId(deal.listingTxId).catch(
      () => null,
    );

    const orderNote =
      "a2a-order:" +
      JSON.stringify({
        v: 1,
        listingTxId: deal.listingTxId,
        buyer: buyerAddress ?? "",
        seller: deal.sellerAddress,
        type: listing?.type ?? "digital-access",
        service: listing?.service ?? deal.service,
        price: deal.finalPrice,
        description: listing?.description ?? "",
        deliveryKind: listing?.deliveryKind ?? "other",
        accessDurationDays: listing?.accessDurationDays,
        createdAt: Date.now(),
      });

    const escrow = await executePayment(
      deal.sellerAddress,
      autoBuy ? 0 : deal.finalPrice,
      orderNote,
    );

    const buyerBal = await getBalance(escrow.buyerAddress);
    const sellerBal = await getBalance(escrow.sellerAddress);

    let vaultAfterHold: Awaited<ReturnType<typeof holdVaultFunds>> | null =
      null;
    let vaultWarning: string | null = null;
    if (autoBuy && buyerAddress) {
      try {
        vaultAfterHold = await holdVaultFunds({
          orderTxId: escrow.txId,
          buyerAddress,
          amountAlgo: deal.finalPrice,
          sellerAddress: deal.sellerAddress,
          service: deal.service,
        });
      } catch (e) {
        vaultWarning =
          e instanceof Error
            ? e.message
            : "Vault hold bookkeeping failed after order marker confirmation";
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
          `• **Order Marker Amount:** ${escrow.amount} ALGO\n` +
          `• **Buyer Balance:** ${buyerBal.toFixed(4)} ALGO\n` +
          `• **Seller Balance:** ${sellerBal.toFixed(4)} ALGO`,
        { escrow, buyerBal, sellerBal },
      ),
    );

    if (vaultAfterHold) {
      actions.push(
        createAction(
          "system",
          "Vault",
          "transaction",
          `Payment is now **held in vault escrow** for this order: **${deal.finalPrice} ALGO**. Funds will be released only after seller delivery submission. Remaining buyer vault balance: **${vaultAfterHold.account.balanceAlgo.toFixed(6)} ALGO**.`,
          {
            vault: vaultAfterHold.account,
            heldPayment: vaultAfterHold.heldPayment,
          },
        ),
      );
    } else if (vaultWarning) {
      actions.push(
        createAction(
          "system",
          "Vault",
          "result",
          `Order marker succeeded but vault hold update needs review: ${vaultWarning}`,
        ),
      );
    }

    actions.push(
      createAction(
        "buyer",
        "Buyer Agent",
        "result",
        (autoBuy
          ? `Order created and payment is **held**: **${deal.finalPrice} ALGO** reserved for **${deal.sellerName}** until delivery is posted.\n\n`
          : `Transaction complete! **${deal.finalPrice} ALGO** paid to **${deal.sellerName}** for "${deal.service}".\n\n`) +
          `**Payment TX:** \`${escrow.txId}\`\n` +
          `**Listing TX:** \`${deal.listingTxId.slice(0, 20)}...\``,
      ),
    );

    return NextResponse.json({
      success: true,
      escrow,
      actions,
      vault: vaultAfterHold?.account,
      heldPayment: vaultAfterHold?.heldPayment,
      vaultWarning,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
