"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@txnlab/use-wallet-react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest } from "@/lib/api/client";
import type {
  DeliveryRecord,
  FeedbackSummary,
  OrderRecord,
} from "@/lib/agents/types";
import { AccessDeliveryPanel } from "@/components/orders/access-delivery-panel";
import { FeedbackPanel } from "@/components/orders/feedback-panel";

function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default function OrderDetailPage() {
  const { orderTxId } = useParams<{ orderTxId: string }>();
  const { activeAccount, signTransactions } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [deliveryProofExplorerUrl, setDeliveryProofExplorerUrl] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"held" | "released">(
    "released",
  );
  const [heldAmountAlgo, setHeldAmountAlgo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);
  const account = mounted ? activeAccount : null;

  const load = useCallback(async () => {
    if (!account?.address) {
      setOrder(null);
      setDelivery(null);
      setFeedback(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{
        order: OrderRecord;
        delivery: DeliveryRecord | null;
        feedback: FeedbackSummary | null;
        paymentStatus: "held" | "released";
        heldAmountAlgo: number | null;
        deliveryProofExplorerUrl: string | null;
        explorerUrl: string | null;
      }>(
        `/api/orders/get?orderTxId=${encodeURIComponent(orderTxId)}&buyer=${encodeURIComponent(account.address)}`,
      );
      setOrder(data.order);
      setDelivery(data.delivery);
      setFeedback(data.feedback);
      setDeliveryProofExplorerUrl(data.deliveryProofExplorerUrl ?? "");
      setPaymentStatus(data.paymentStatus ?? "released");
      setHeldAmountAlgo(data.heldAmountAlgo ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
      setOrder(null);
      setDelivery(null);
      setFeedback(null);
      setDeliveryProofExplorerUrl("");
      setPaymentStatus("released");
      setHeldAmountAlgo(null);
    } finally {
      setLoading(false);
    }
  }, [account?.address, orderTxId]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderLoading = loading && Boolean(account?.address);

  return (
    <DashboardShell
      title="Order"
      subtitle="View your purchase, delivered access, and feedback controls."
    >
      <section className="section-grid no-skew">
        <div style={{ display: "grid", gap: "1rem" }}>
          <article className="cyber-card terminal-panel">
            <div className="section-head">
              <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>Order Details</span>
              </h3>
              <button className="btn-outline" type="button" onClick={load}>
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                Refresh
              </button>
            </div>

            {!account && (
              <p className="status-muted">
                Connect a wallet to view this order.
              </p>
            )}
            {error && (
              <p className="status-bad">
                <AlertTriangle size={14} /> {error}
              </p>
            )}

            {order && (
              <div className="list-stack">
                <div className="list-item">
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0 }}>{order.service}</p>
                    <span>
                      {order.type} • {order.price} ALGO • Seller{" "}
                      {shortAddress(order.seller)}
                    </span>
                    <span style={{ wordBreak: "break-all" }}>
                      Order TX: {order.orderTxId}
                    </span>
                    <span style={{ wordBreak: "break-all" }}>
                      Listing TX: {order.listingTxId}
                    </span>
                    {delivery?.proofTxId && (
                      <span style={{ wordBreak: "break-all" }}>
                        Delivery Proof TX: {delivery.proofTxId}
                      </span>
                    )}
                    <span>
                      Payment: {paymentStatus === "held" ? "Held" : "Released"}
                      {paymentStatus === "held" && heldAmountAlgo
                        ? ` (${heldAmountAlgo} ALGO)`
                        : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link className="btn-outline" href="/orders">
                      Back
                    </Link>
                    <a
                      className="btn-outline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://testnet.explorer.perawallet.app/tx/${order.orderTxId}`}
                    >
                      <ExternalLink size={14} />
                      Order TX
                    </a>
                    {delivery?.proofTxId && (
                      <a
                        className="btn-outline"
                        target="_blank"
                        rel="noreferrer"
                        href={
                          deliveryProofExplorerUrl ||
                          `https://testnet.explorer.perawallet.app/tx/${delivery.proofTxId}`
                        }
                      >
                        <ExternalLink size={14} />
                        Proof TX
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </article>

          <FeedbackPanel
            buyerAddress={account?.address ?? null}
            order={order}
            feedback={feedback}
            signTransactions={signTransactions}
            onFeedback={setFeedback}
            loading={orderLoading}
          />
        </div>

        <AccessDeliveryPanel
          order={order}
          delivery={delivery}
          deliveryProofExplorerUrl={deliveryProofExplorerUrl}
          loading={orderLoading}
        />
      </section>
    </DashboardShell>
  );
}
