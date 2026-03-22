"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@txnlab/use-wallet-react";
import { AlertTriangle, CheckCircle2, RefreshCw, Truck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest, decodeTxnB64, encodeTxnB64 } from "@/lib/api/client";

interface SellerOrderRow {
  orderTxId: string;
  buyer: string;
  seller: string;
  type: string;
  service: string;
  price: number;
  deliveryKind?: string;
  paymentStatus?: "held" | "released";
  heldAmountAlgo?: number | null;
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export default function SellerDeliveryOrderPage() {
  const { orderTxId } = useParams<{ orderTxId: string }>();
  const { activeAccount, signTransactions } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [order, setOrder] = useState<SellerOrderRow | null>(null);

  const [deliveryFields, setDeliveryFields] = useState<
    { key: string; value: string }[]
  >([
    { key: "username", value: "" },
    { key: "password", value: "" },
  ]);
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>("");
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [delivering, setDelivering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);
  const account = mounted ? activeAccount : null;

  const normalizedOrderTxId = useMemo(
    () => String(orderTxId ?? ""),
    [orderTxId],
  );

  const loadOrder = useCallback(async () => {
    if (!account?.address || !normalizedOrderTxId) {
      setOrder(null);
      return;
    }

    setLoadingOrder(true);
    setError("");
    try {
      const data = await apiRequest<{ orders?: SellerOrderRow[] }>(
        `/api/orders/fetch?role=seller&seller=${encodeURIComponent(account.address)}`,
      );
      const found = (data.orders ?? []).find(
        (o) => o.orderTxId === normalizedOrderTxId,
      );
      if (!found) {
        throw new Error("Order not found for this seller account");
      }
      setOrder(found);
    } catch (e) {
      setError(getErrorText(e));
      setOrder(null);
    } finally {
      setLoadingOrder(false);
    }
  }, [account?.address, normalizedOrderTxId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function prepareAndSubmitDeliveryProof(): Promise<void> {
    if (!account || !order) return;
    setDelivering(true);
    setDeliveryStatus("Preparing delivery proof transaction...");
    setError("");
    try {
      const prep = await apiRequest<{ unsignedTxn: string }>(
        "/api/delivery/prepare-proof",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerAddress: account.address,
            orderTxId: order.orderTxId,
          }),
        },
      );

      const unsignedBytes = decodeTxnB64(prep.unsignedTxn);
      setDeliveryStatus("Waiting for wallet signature...");
      const signed = (await signTransactions([unsignedBytes]))[0];
      if (!signed) throw new Error("Wallet returned an empty signature");

      const signedB64 = encodeTxnB64(signed);
      setDeliveryStatus("Submitting proof on-chain...");
      await apiRequest<{ txId: string }>("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });

      setDeliveryStatus("Delivery proof confirmed. Now submit access payload.");
    } catch (e) {
      setError(getErrorText(e));
      setDeliveryStatus("");
    } finally {
      setDelivering(false);
    }
  }

  async function submitDelivery(): Promise<void> {
    if (!account || !order) return;
    setDelivering(true);
    setDeliveryStatus("Submitting delivery payload...");
    setError("");

    try {
      const fields: Record<string, string> = {};
      for (const row of deliveryFields) {
        const k = row.key.trim();
        const v = row.value;
        if (!k || !v) continue;
        fields[k] = v;
      }

      const payload = await apiRequest<{
        success: boolean;
        release?: { txId: string; amountAlgo: number } | null;
      }>("/api/delivery/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: account.address,
          orderTxId: order.orderTxId,
          deliveryKind: order.deliveryKind ?? "other",
          fields,
          instructions: deliveryInstructions,
        }),
      });

      if (payload.release?.txId) {
        setDeliveryStatus(
          `Delivery saved. Held payment released: ${payload.release.amountAlgo} ALGO (TX: ${payload.release.txId}).`,
        );
      } else {
        setDeliveryStatus("Delivery saved.");
      }

      await loadOrder();
    } catch (e) {
      setError(getErrorText(e));
      setDeliveryStatus("");
    } finally {
      setDelivering(false);
    }
  }

  return (
    <DashboardShell
      title="Post Delivery"
      subtitle="Post proof and access payload for one order."
    >
      <section className="cyber-card terminal-panel">
        <div className="section-head">
          <Truck size={18} />
          <h3>Order Delivery</h3>
          <button className="btn-outline" type="button" onClick={loadOrder}>
            <RefreshCw size={14} className={loadingOrder ? "spin" : ""} />
            Refresh
          </button>
        </div>

        {!account && (
          <p className="status-muted">
            Connect wallet to access delivery tools.
          </p>
        )}
        {error && (
          <p className="status-bad">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
        {deliveryStatus && (
          <p className="status-good">
            <CheckCircle2 size={14} /> {deliveryStatus}
          </p>
        )}

        {order && (
          <>
            <div className="list-item" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0 }}>{order.service}</p>
                <span>
                  {order.type} • {order.price} ALGO • Buyer{" "}
                  {String(order.buyer).slice(0, 8)}…
                </span>
                <span style={{ wordBreak: "break-all" }}>
                  Order TX: {order.orderTxId}
                </span>
                <span>
                  Payment:{" "}
                  {order.paymentStatus === "held" ? "Held" : "Released"}
                  {order.paymentStatus === "held" && order.heldAmountAlgo
                    ? ` • ${order.heldAmountAlgo} ALGO`
                    : ""}
                </span>
              </div>
              <Link href="/sell" className="btn-outline">
                Back to Sell
              </Link>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn-outline"
                type="button"
                disabled={delivering}
                onClick={() => prepareAndSubmitDeliveryProof()}
              >
                Post Delivery Proof
              </button>
              <button
                className="btn-neon"
                type="button"
                disabled={delivering}
                onClick={() => submitDelivery()}
              >
                Submit Delivery
              </button>
            </div>

            <label style={{ marginTop: 10, display: "block" }}>
              <span>DELIVERY INSTRUCTIONS</span>
              <textarea
                className="cyber-textarea"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
              />
            </label>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {deliveryFields.map((row, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8 }}>
                  <input
                    value={row.key}
                    onChange={(e) =>
                      setDeliveryFields((p) =>
                        p.map((it, i) =>
                          i === idx ? { ...it, key: e.target.value } : it,
                        ),
                      )
                    }
                    placeholder="> key"
                    className="cyber-select"
                  />
                  <input
                    value={row.value}
                    onChange={(e) =>
                      setDeliveryFields((p) =>
                        p.map((it, i) =>
                          i === idx ? { ...it, value: e.target.value } : it,
                        ),
                      )
                    }
                    placeholder="> value"
                  />
                </div>
              ))}
              <button
                className="btn-outline"
                type="button"
                onClick={() =>
                  setDeliveryFields((p) => [...p, { key: "", value: "" }])
                }
              >
                Add Field
              </button>
            </div>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
