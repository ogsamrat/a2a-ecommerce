"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Package,
  RefreshCw,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

type ListingType = "cloud-storage" | "api-access" | "compute" | "hosting";

interface ListingForm {
  type: ListingType;
  service: string;
  price: string;
  description: string;
}

interface ApiListing {
  txId: string;
  type: string;
  service: string;
  price: number;
  description: string;
}

const defaultForm: ListingForm = {
  type: "cloud-storage",
  service: "",
  price: "",
  description: "",
};

const typeOptions: ListingType[] = [
  "cloud-storage",
  "api-access",
  "compute",
  "hosting",
];

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export default function SellPage() {
  const { activeAccount, signTransactions } = useWallet();
  const [form, setForm] = useState<ListingForm>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [myListings, setMyListings] = useState<ApiListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  const canSubmit = useMemo(() => {
    const price = Number(form.price);
    return (
      !!activeAccount &&
      !!form.service.trim() &&
      !!form.description.trim() &&
      Number.isFinite(price) &&
      price > 0
    );
  }, [activeAccount, form]);

  async function refreshListings() {
    if (!activeAccount) return;
    setLoadingListings(true);
    setError("");
    try {
      const res = await fetch(
        `/api/listings/fetch?seller=${encodeURIComponent(activeAccount.address)}`,
      );
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error ?? "Failed to fetch listings");
      setMyListings(data.listings ?? []);
    } catch (err) {
      setError(getErrorText(err));
    } finally {
      setLoadingListings(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeAccount) {
      setError("Connect wallet before listing products.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Building unsigned listing transaction...");

    try {
      const createRes = await fetch("/api/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: activeAccount.address,
          type: form.type,
          service: form.service.trim(),
          price: Number(form.price),
          description: form.description.trim(),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || createData.error) {
        throw new Error(
          createData.error ?? "Unable to create listing transaction",
        );
      }

      const unsignedBytes = Uint8Array.from(atob(createData.unsignedTxn), (c) =>
        c.charCodeAt(0),
      );
      setMessage("Waiting for wallet signature...");
      const signed = (await signTransactions([unsignedBytes]))[0];
      if (!signed) throw new Error("Wallet returned an empty signature");

      const signedB64 = btoa(String.fromCharCode(...Array.from(signed)));
      setMessage("Submitting signed transaction...");
      const submitRes = await fetch("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok || submitData.error) {
        throw new Error(submitData.error ?? "Transaction submission failed");
      }

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
              <select
                className="cyber-select"
                value={form.type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    type: e.target.value as ListingType,
                  }))
                }
              >
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
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

          {!activeAccount && (
            <p className="status-muted">Connect wallet to create listings.</p>
          )}
          {message && (
            <p className="status-good">
              <CheckCircle2 size={14} /> {message}
            </p>
          )}
          {error && (
            <p className="status-bad">
              <AlertTriangle size={14} /> {error}
            </p>
          )}
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
                  {item.type} • {item.price} ALGO
                </span>
              </div>
            ))}
            {!myListings.length && (
              <p className="status-muted">No listings loaded yet.</p>
            )}
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
