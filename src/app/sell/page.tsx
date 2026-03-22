"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  apiRequest,
  decodeTxnB64,
  encodeTxnB64,
  resetApiState,
} from "@/lib/api/client";

interface ListingForm {
  type: string;
  service: string;
  price: string;
  description: string;
  deliveryKind: string;
  accessDurationDays: string;
}

interface ApiListing {
  txId: string;
  type: string;
  service: string;
  price: number;
  description: string;
  deliveryKind?: string;
  accessDurationDays?: number;
}

interface SellerOrderRow {
  orderTxId: string;
  buyer: string;
  seller: string;
  type: string;
  service: string;
  price: number;
  deliveryKind?: string;
}

const defaultForm: ListingForm = {
  type: "cloud-storage",
  service: "",
  price: "",
  description: "",
  deliveryKind: "instructions",
  accessDurationDays: "30",
};

const suggestedTypes = [
  "cloud-storage",
  "api-access",
  "compute",
  "hosting",
] as const;

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function normalizeTypePreview(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export default function SellPage() {
  const { activeAccount, signTransactions } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<ListingForm>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [resetStatus, setResetStatus] = useState<string>("");
  const [myListings, setMyListings] = useState<ApiListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  const [myOrders, setMyOrders] = useState<SellerOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderTxId, setSelectedOrderTxId] = useState<string>("");
  const [deliveryFields, setDeliveryFields] = useState<
    { key: string; value: string }[]
  >([
    { key: "username", value: "" },
    { key: "password", value: "" },
  ]);
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>("");
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const account = mounted ? activeAccount : null;

  const canSubmit = useMemo(() => {
    const price = Number(form.price);
    return (
      !!account &&
      !!form.type.trim() &&
      !!form.service.trim() &&
      !!form.description.trim() &&
      Number.isFinite(price) &&
      price > 0
    );
  }, [account, form]);

  const normalizedType = useMemo(
    () => normalizeTypePreview(form.type),
    [form.type],
  );

  async function refreshListings() {
    if (!account) {
      setMyListings([]);
      return;
    }
    setLoadingListings(true);
    setError("");
    setWarning("");
    setResetStatus("");
    try {
      const data = await apiRequest<{
        listings?: ApiListing[];
        warning?: string;
      }>(`/api/listings/fetch?seller=${encodeURIComponent(account.address)}`);
      setMyListings(data.listings ?? []);
      setWarning(data.warning ?? "");
    } catch (err) {
      setError(getErrorText(err));
    } finally {
      setLoadingListings(false);
    }
  }

  useEffect(() => {
    if (!account) {
      setMyListings([]);
      return;
    }
    void refreshListings();
    void refreshOrders();
  }, [account?.address]);

  async function prepareAndSubmitDeliveryProof(
    orderTxId: string,
  ): Promise<void> {
    if (!account) return;
    setDelivering(true);
    setDeliveryStatus("Preparing delivery proof transaction...");
    setError("");
    try {
      const prep = await apiRequest<{ unsignedTxn: string }>(
        "/api/delivery/prepare-proof",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellerAddress: account.address, orderTxId }),
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

  async function submitDelivery(
    orderTxId: string,
    deliveryKind: string,
  ): Promise<void> {
    if (!account) return;
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
      await apiRequest<{ success: boolean }>("/api/delivery/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: account.address,
          orderTxId,
          deliveryKind,
          fields,
          instructions: deliveryInstructions,
        }),
      });
      setDeliveryStatus(
        "Delivery saved. Buyer can reveal credentials in Orders.",
      );
      await refreshOrders();
    } catch (e) {
      setError(getErrorText(e));
      setDeliveryStatus("");
    } finally {
      setDelivering(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account) {
      setError("Connect wallet before listing products.");
      return;
    }

    setBusy(true);
    setError("");
    setWarning("");
    setResetStatus("");
    setMessage("Building unsigned listing transaction...");

    try {
      const createData = await apiRequest<{ unsignedTxn: string }>(
        "/api/listings/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: account.address,
            type: form.type,
            service: form.service.trim(),
            price: Number(form.price),
            description: form.description.trim(),
            deliveryKind: form.deliveryKind,
            accessDurationDays: form.accessDurationDays.trim()
              ? Number(form.accessDurationDays)
              : undefined,
          }),
        },
      );

      const unsignedBytes = decodeTxnB64(createData.unsignedTxn);
      setMessage("Waiting for wallet signature...");
      const signed = (await signTransactions([unsignedBytes]))[0];
      if (!signed) throw new Error("Wallet returned an empty signature");

      const signedB64 = encodeTxnB64(signed);
      setMessage("Submitting signed transaction...");
      const submitData = await apiRequest<{ txId: string }>(
        "/api/wallet/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTxn: signedB64 }),
        },
      );

      setMessage(`Listing confirmed: ${submitData.txId}`);
      setForm(defaultForm);
      await refreshListings();
    } catch (err) {
      setError(getErrorText(err));
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function refreshOrders() {
    if (!account) {
      setMyOrders([]);
      return;
    }
    setLoadingOrders(true);
    setError("");
    setWarning("");
    setDeliveryStatus("");
    try {
      const data = await apiRequest<{
        orders?: SellerOrderRow[];
        warning?: string;
      }>(
        `/api/orders/fetch?role=seller&seller=${encodeURIComponent(account.address)}`,
      );
      setMyOrders(data.orders ?? []);
      setWarning(data.warning ?? "");
    } catch (err) {
      setError(getErrorText(err));
    } finally {
      setLoadingOrders(false);
    }
  }

  async function onResetApi() {
    setResetStatus("Resetting API state...");
    const result = await resetApiState();
    if (result.ok) {
      setError("");
      setMessage("");
      setResetStatus(result.warning ?? "API reset complete.");
      await refreshListings();
      return;
    }
    setResetStatus(result.error ?? "Failed to reset API state.");
  }

  return (
    <DashboardShell
      title="Sell"
      subtitle="Create product listings so buyer agents can discover and negotiate against them."
    >
      <section className="section-grid no-skew">
        <article className="cyber-card holographic-panel">
          <div className="section-head">
            <Package size={18} />
            <h3>Create Listing</h3>
          </div>

          <form className="cyber-form" onSubmit={onSubmit}>
            <label>
              <span>TYPE</span>
              <input
                value={form.type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    type: e.target.value,
                  }))
                }
                className="cyber-select"
                list="listing-type-suggestions"
                placeholder="> compute-gpu"
                required
              />
              <datalist id="listing-type-suggestions">
                {suggestedTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
              <p className="status-muted">
                Stored as: {normalizedType || "-"} (lowercase,
                spaces/underscores converted to hyphen)
              </p>
            </label>

            <label>
              <span>DELIVERY TYPE</span>
              <select
                className="cyber-select"
                value={form.deliveryKind}
                onChange={(e) =>
                  setForm((p) => ({ ...p, deliveryKind: e.target.value }))
                }
              >
                <option value="credentials">Account Credentials</option>
                <option value="api_key">API Key</option>
                <option value="invite_link">Invite Link</option>
                <option value="instructions">Instructions Only</option>
                <option value="provisioned">Provisioned Access</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <span>ACCESS DURATION (DAYS)</span>
              <input
                value={form.accessDurationDays}
                onChange={(e) =>
                  setForm((p) => ({ ...p, accessDurationDays: e.target.value }))
                }
                placeholder="> 30"
                inputMode="numeric"
              />
            </label>

            <label>
              <span>SERVICE NAME</span>
              <input
                value={form.service}
                onChange={(e) =>
                  setForm((p) => ({ ...p, service: e.target.value }))
                }
                placeholder="> Enterprise Cloud Storage"
                required
              />
            </label>

            <label>
              <span>PRICE (ALGO)</span>
              <input
                value={form.price}
                onChange={(e) =>
                  setForm((p) => ({ ...p, price: e.target.value }))
                }
                placeholder="> 0.5"
                inputMode="decimal"
                required
              />
            </label>

            <label>
              <span>DESCRIPTION</span>
              <textarea
                className="cyber-textarea"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="> high-availability storage with backup"
                required
              />
            </label>

            <button
              className="btn-neon"
              type="submit"
              disabled={!canSubmit || busy}
            >
              {busy ? "Publishing..." : "Publish Listing"}
            </button>
          </form>

          {!account && (
            <p className="status-muted">Connect wallet to create listings.</p>
          )}
          {message && (
            <p className="status-good">
              <CheckCircle2 size={14} /> {message}
            </p>
          )}
          {error && (
            <>
              <p className="status-bad">
                <AlertTriangle size={14} /> {error}
              </p>
              <button
                className="btn-outline"
                type="button"
                onClick={onResetApi}
              >
                Reset & Fix API
              </button>
            </>
          )}
          {resetStatus && <p className="status-muted">{resetStatus}</p>}
          {warning && <p className="status-muted">{warning}</p>}
        </article>

        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <FileText size={18} />
            <h3>My Listings</h3>
            <button
              className="btn-outline"
              type="button"
              onClick={refreshListings}
            >
              <RefreshCw size={14} className={loadingListings ? "spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="list-stack">
            {myListings.map((item) => (
              <div key={item.txId} className="list-item">
                <p>{item.service}</p>
                <span>
                  {item.type} • {item.price} ALGO •{" "}
                  {item.deliveryKind ?? "other"}
                </span>
              </div>
            ))}
            {!myListings.length && (
              <p className="status-muted">No listings loaded yet.</p>
            )}
          </div>
        </article>

        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Truck size={18} />
            <h3>Deliver Orders</h3>
            <button
              className="btn-outline"
              type="button"
              onClick={refreshOrders}
            >
              <RefreshCw size={14} className={loadingOrders ? "spin" : ""} />
              Refresh
            </button>
          </div>

          {warning && <p className="status-muted">{warning}</p>}
          {deliveryStatus && <p className="status-muted">{deliveryStatus}</p>}

          <div className="list-stack">
            {myOrders.map((o) => (
              <button
                key={o.orderTxId}
                type="button"
                className="list-item"
                onClick={() => setSelectedOrderTxId(o.orderTxId)}
                style={{ textAlign: "left" }}
              >
                <p style={{ margin: 0 }}>{o.service}</p>
                <span>
                  {o.type} • {o.price} ALGO • Buyer{" "}
                  {String(o.buyer).slice(0, 8)}…
                </span>
              </button>
            ))}
            {!myOrders.length && (
              <p className="status-muted">No incoming orders found yet.</p>
            )}
          </div>

          {selectedOrderTxId && (
            <div style={{ marginTop: 12 }}>
              <p className="code-tag" style={{ wordBreak: "break-all" }}>
                Selected order: {selectedOrderTxId}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn-outline"
                  type="button"
                  disabled={delivering}
                  onClick={() =>
                    prepareAndSubmitDeliveryProof(selectedOrderTxId)
                  }
                >
                  Post Delivery Proof
                </button>
                <button
                  className="btn-neon"
                  type="button"
                  disabled={delivering}
                  onClick={() =>
                    submitDelivery(selectedOrderTxId, form.deliveryKind)
                  }
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
            </div>
          )}
        </article>
      </section>
    </DashboardShell>
  );
}
