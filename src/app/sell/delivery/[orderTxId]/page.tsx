"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Truck,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest, decodeTxnB64, encodeTxnB64 } from "@/lib/api/client";

interface SellerOrderRow {
  orderTxId: string;
  buyer: string;
  seller: string;
  type: string;
  service: string;
  price: number;
  deliveryProofTxId?: string | null;
  deliveryProofConfirmedRound?: number | null;
  deliveryKind?: string;
  paymentStatus?: "held" | "released";
  heldAmountAlgo?: number | null;
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function prettyType(type: string | undefined): string {
  const raw = (type ?? "").trim().toLowerCase();
  if (!raw || raw === "unknown") return "Digital Access";
  return raw
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
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
  const [proofPosted, setProofPosted] = useState(false);
  const [proofTxId, setProofTxId] = useState<string>("");
  const [proofExplorerUrl, setProofExplorerUrl] = useState<string>("");
  const instructionsRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    const el = instructionsRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(140, el.scrollHeight)}px`;
  }, [deliveryInstructions]);

  useEffect(() => {
    if (!order?.deliveryProofTxId) return;
    setProofPosted(true);
    setProofTxId(order.deliveryProofTxId);
    setProofExplorerUrl(
      `https://testnet.explorer.perawallet.app/tx/${order.deliveryProofTxId}`,
    );
  }, [order?.deliveryProofTxId]);

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
      const submit = await apiRequest<{ txId: string; explorerUrl?: string }>(
        "/api/wallet/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTxn: signedB64 }),
        },
      );

      setProofPosted(true);
      setProofTxId(submit.txId);
      setProofExplorerUrl(submit.explorerUrl ?? "");
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

      if (!deliveryInstructions.trim() && Object.keys(fields).length === 0) {
        throw new Error(
          "Add delivery instructions or at least one access field before submitting.",
        );
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

      setProofPosted(false);
      setProofTxId("");
      setProofExplorerUrl("");

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
            <div
              className="cyber-card"
              style={{
                marginBottom: 14,
                background:
                  "linear-gradient(180deg, rgba(18,18,28,0.95), rgba(12,12,20,0.95))",
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{order.service}</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 8,
                  }}
                >
                  <span>Type: {prettyType(order.type)}</span>
                  <span>Price: {order.price} ALGO</span>
                  <span>Buyer: {shortAddress(order.buyer)}</span>
                  <span>
                    Payment:{" "}
                    {order.paymentStatus === "held" ? "Held" : "Released"}
                    {order.paymentStatus === "held" && order.heldAmountAlgo
                      ? ` (${order.heldAmountAlgo} ALGO)`
                      : ""}
                  </span>
                </div>
                <span style={{ wordBreak: "break-all" }}>
                  Order TX: {order.orderTxId}
                </span>
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href="/sell" className="btn-outline">
                  Back to Sell
                </Link>
              </div>
            </div>

            <div
              className="delivery-two-col"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(260px, 0.9fr) minmax(360px, 1.1fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div className="cyber-card" style={{ display: "grid", gap: 10 }}>
                <span className="code-tag">POST DELIVERY FLOW</span>
                <div
                  className="status-muted"
                  style={{ display: "grid", gap: 5 }}
                >
                  <p>1. Post delivery proof transaction first.</p>
                  <p>2. Add buyer instructions and credentials.</p>
                  <p>3. Submit payload to release held payment.</p>
                </div>
                <div className="delivery-actions">
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
                {proofPosted && (
                  <p className="status-good" style={{ marginBottom: 0 }}>
                    <CheckCircle2 size={14} /> Proof posted in this session.
                  </p>
                )}
                {proofTxId && (
                  <a
                    className="btn-outline"
                    href={
                      proofExplorerUrl ||
                      `https://testnet.explorer.perawallet.app/tx/${proofTxId}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: "fit-content" }}
                  >
                    <ExternalLink size={14} />
                    View Proof on Explorer
                  </a>
                )}
              </div>

              <div className="cyber-card" style={{ display: "grid", gap: 8 }}>
                <span className="code-tag">
                  DELIVERY INSTRUCTIONS FOR BUYER
                </span>
                <textarea
                  ref={instructionsRef}
                  className="cyber-textarea delivery-instructions-box"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="Explain login steps, what the buyer receives, expiry details, and support instructions..."
                  style={{ minHeight: 140, overflow: "hidden", resize: "none" }}
                />
              </div>
            </div>

            <div
              className="cyber-card"
              style={{
                marginTop: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span className="code-tag">
                ACCESS PAYLOAD (ENCRYPTED AT REST)
              </span>
              {deliveryFields.map((row, idx) => (
                <div
                  className="delivery-field-row"
                  key={idx}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={row.key}
                    onChange={(e) =>
                      setDeliveryFields((p) =>
                        p.map((it, i) =>
                          i === idx ? { ...it, key: e.target.value } : it,
                        ),
                      )
                    }
                    placeholder="field name (e.g. username)"
                    className="cyber-select"
                    style={{ flex: "1 1 220px" }}
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
                    placeholder="field value"
                    className="delivery-value-input"
                    style={{ flex: "1.4 1 280px" }}
                  />
                  <button
                    className="btn-outline"
                    type="button"
                    onClick={() =>
                      setDeliveryFields((p) => p.filter((_, i) => i !== idx))
                    }
                    disabled={deliveryFields.length <= 1}
                    style={{ minWidth: 96 }}
                  >
                    Remove
                  </button>
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
