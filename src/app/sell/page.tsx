"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
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
  deliveryProofTxId?: string | null;
  deliveryProofConfirmedRound?: number | null;
  deliveryKind?: string;
  paymentStatus?: "held" | "released";
  heldAmountAlgo?: number | null;
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
            {loadingListings && (
              <p className="status-muted">
                <span className="loading-dots">Loading</span>
              </p>
            )}
            {!loadingListings && !myListings.length && (
              <p className="status-muted">No listings loaded yet.</p>
            )}
          </div>
        </article>

        <article
          className="cyber-card terminal-panel"
          style={{ gridColumn: "1 / -1" }}
        >
          <div
            className="section-head"
            style={{ justifyContent: "space-between", flexWrap: "nowrap" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={18} />
              <h3>Deliver Orders</h3>
            </div>
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

          <div className="list-stack">
            {myOrders.map((o) => (
              <div
                key={o.orderTxId}
                className="list-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "nowrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0 }}>{o.service}</p>
                  <span>
                    {o.type} • {o.price} ALGO • Buyer{" "}
                    {String(o.buyer).slice(0, 8)}…
                  </span>
                  <span>
                    Status:{" "}
                    {o.paymentStatus === "held"
                      ? "Payment Held"
                      : "Payment Released"}
                    {o.paymentStatus === "held" && o.heldAmountAlgo
                      ? ` • Held: ${o.heldAmountAlgo} ALGO`
                      : ""}
                    {o.deliveryProofTxId
                      ? " • Proof Posted"
                      : " • Proof Pending"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link
                    className="btn-outline"
                    href={`/sell/delivery/${encodeURIComponent(o.orderTxId)}`}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Open Delivery
                  </Link>
                  {o.deliveryProofTxId && (
                    <a
                      className="btn-outline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://testnet.explorer.perawallet.app/tx/${o.deliveryProofTxId}`}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <ExternalLink size={14} />
                      Proof TX
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loadingOrders && (
              <p className="status-muted">
                <span className="loading-dots">Loading</span>
              </p>
            )}
            {!loadingOrders && !myOrders.length && (
              <p className="status-muted">No incoming orders found yet.</p>
            )}
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
