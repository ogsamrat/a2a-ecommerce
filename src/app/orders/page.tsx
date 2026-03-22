"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { AlertTriangle, ExternalLink, Receipt, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest } from "@/lib/api/client";
import type { FeedbackSummary, OrderRecord } from "@/lib/agents/types";

interface OrdersApiRow extends OrderRecord {
  deliveredAt: number | null;
  deliveryProofTxId: string | null;
  deliveryProofConfirmedRound: number | null;
  feedback: FeedbackSummary | null;
  paymentStatus?: "held" | "released";
  heldAmountAlgo?: number | null;
}

function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default function OrdersPage() {
  const { activeAccount } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [orders, setOrders] = useState<OrdersApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => setMounted(true), []);
  const account = mounted ? activeAccount : null;

  const load = useCallback(async () => {
    if (!account?.address) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const data = await apiRequest<{
        orders?: OrdersApiRow[];
        warning?: string;
      }>(
        `/api/orders/fetch?role=buyer&buyer=${encodeURIComponent(account.address)}`,
      );
      setOrders(data.orders ?? []);
      setWarning(data.warning ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [account?.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasOrders = useMemo(() => orders.length > 0, [orders.length]);

  return (
    <DashboardShell
      title="Orders"
      subtitle="All purchases tied to your wallet with post-purchase access delivery."
    >
      <section className="cyber-card terminal-panel">
        <div className="section-head">
          <Receipt size={18} />
          <h3>Purchased Orders</h3>
          <button className="btn-outline" type="button" onClick={load}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>

        {!account && (
          <p className="status-muted">Connect a wallet to view your orders.</p>
        )}
        {warning && <p className="status-muted">{warning}</p>}
        {error && (
          <p className="status-bad">
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        <div className="list-stack">
          {orders.map((o) => (
            <div key={o.orderTxId} className="list-item" style={{ gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                }}
              >
                <p style={{ margin: 0 }}>{o.service}</p>
                <span>
                  {o.type} • {o.price} ALGO • Seller {shortAddress(o.seller)}
                </span>
                <span>
                  Payment: {o.paymentStatus === "held" ? "Held" : "Released"}
                  {o.paymentStatus === "held" && o.heldAmountAlgo
                    ? ` (${o.heldAmountAlgo} ALGO)`
                    : ""}{" "}
                  • Delivery: {o.deliveredAt ? "Delivered" : "Pending"} • Proof:{" "}
                  {o.deliveryProofTxId ? "Posted" : "Pending"} • Feedback:{" "}
                  {o.feedback
                    ? o.feedback.isUndone
                      ? "Undone"
                      : `${o.feedback.rating}/5`
                    : "None"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link className="btn-outline" href={`/orders/${o.orderTxId}`}>
                  Open
                </Link>
                <a
                  className="btn-outline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://testnet.explorer.perawallet.app/tx/${o.orderTxId}`}
                >
                  <ExternalLink size={14} />
                  Order TX
                </a>
                {o.deliveryProofTxId && (
                  <a
                    className="btn-outline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://testnet.explorer.perawallet.app/tx/${o.deliveryProofTxId}`}
                  >
                    <ExternalLink size={14} />
                    Proof TX
                  </a>
                )}
              </div>
            </div>
          ))}

          {!hasOrders && account && !loading && !error && (
            <p className="status-muted">
              No orders found yet. Buy from Marketplace to create your first
              order.
            </p>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
