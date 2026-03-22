"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  apiRequest,
  decodeTxnB64,
  encodeTxnB64,
  resetApiState,
} from "@/lib/api/client";
import type { OnChainListing } from "@/lib/agents/types";

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

function formatTypeLabel(type: string): string {
  const normalized = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  const labels: Record<string, string> = {
    account: "Account Access",
    "cloud-storage": "Cloud Storage",
    "api-access": "API Access",
    compute: "Compute",
    hosting: "Hosting",
    other: "Other",
  };

  if (labels[normalized]) return labels[normalized];

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function MarketplacePage() {
  const { activeAccount, signTransactions } = useWallet();
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [selectedItem, setSelectedItem] = useState<OnChainListing | null>(null);
  const [sellerRatings, setSellerRatings] = useState<
    Record<string, { score: number; count: number }>
  >({});
  const [listingRatings, setListingRatings] = useState<
    Record<string, { score: number; count: number }>
  >({});
  const [type, setType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [purchaseMsg, setPurchaseMsg] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  const loadRatings = useCallback(async (items: OnChainListing[]) => {
    const sellers = [...new Set(items.map((i) => i.seller).filter(Boolean))];
    const listings = [...new Set(items.map((i) => i.txId).filter(Boolean))];
    if (!sellers.length && !listings.length) {
      setSellerRatings({});
      setListingRatings({});
      return;
    }

    try {
      const data = await apiRequest<{
        sellers?: Record<string, { score: number; count: number }>;
        listings?: Record<string, { score: number; count: number }>;
      }>("/api/ratings/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellers, listings }),
      });
      setSellerRatings(data.sellers ?? {});
      setListingRatings(data.listings ?? {});
    } catch {
      setSellerRatings({});
      setListingRatings({});
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");
    setResetStatus("");
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (maxBudget.trim()) params.set("maxBudget", maxBudget.trim());

      const data = await apiRequest<{
        listings?: OnChainListing[];
        warning?: string;
      }>(`/api/listings/fetch?${params.toString()}`);
      const nextListings = data.listings ?? [];
      setListings(nextListings);
      setWarning(data.warning ?? "");
      await loadRatings(nextListings);
    } catch (err) {
      setError(asError(err));
      setListings([]);
      setSellerRatings({});
      setListingRatings({});
    } finally {
      setLoading(false);
    }
  }, [loadRatings, maxBudget, type]);

  useEffect(() => {
    void fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchListings();
    }, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, [fetchListings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((item) =>
      [item.service, item.seller, item.description, item.type].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }, [listings, query]);

  function formatReputation100(
    score: number | undefined,
    count: number | undefined,
  ): string {
    if (!count) return "Unrated";
    if (score === undefined) return "N/A";
    const normalized = score <= 5 ? score * 20 : score;
    const reputation = Math.max(0, Math.min(100, normalized));
    return `${reputation.toFixed(0)}/100`;
  }

  function reputationTone(
    score: number | undefined,
    count: number | undefined,
  ): "new" | "low" | "mid" | "high" {
    if (!count || score === undefined) return "new";
    const normalized = score <= 5 ? score * 20 : score;
    if (normalized >= 80) return "high";
    if (normalized >= 60) return "mid";
    return "low";
  }

  function reputationDetails(count: number | undefined): string {
    if (!count) return "No feedback yet";
    return `Based on ${count} buyer feedback ${count === 1 ? "entry" : "entries"}`;
  }

  const canBuy = Boolean(activeAccount?.address && selectedItem && !purchasing);

  async function buySelected(): Promise<void> {
    if (!activeAccount?.address || !selectedItem) return;
    setPurchasing(true);
    setPurchaseMsg("");
    setError("");
    try {
      const create = await apiRequest<{
        unsignedTxn: string;
        order: { orderTxId: string };
      }>("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: activeAccount.address,
          sellerAddress: selectedItem.seller,
          listingTxId: selectedItem.txId,
          type: selectedItem.type,
          service: selectedItem.service,
          price: selectedItem.price,
          description: selectedItem.description,
          deliveryKind: selectedItem.deliveryKind ?? "other",
          accessDurationDays: selectedItem.accessDurationDays,
        }),
      });

      const unsignedBytes = decodeTxnB64(create.unsignedTxn);
      const signed = (await signTransactions([unsignedBytes]))[0];
      if (!signed) throw new Error("Wallet returned empty signature");
      const signedB64 = encodeTxnB64(signed);
      const submit = await apiRequest<{ txId: string }>("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });

      await apiRequest<{ success: boolean }>("/api/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txId: submit.txId,
          buyerAddress: activeAccount.address,
        }),
      });

      setPurchaseMsg(`Order confirmed & payment held: ${submit.txId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  }

  async function onResetApi() {
    setResetStatus("Resetting API state...");
    const result = await resetApiState();
    if (result.ok) {
      setResetStatus(
        result.warning ?? "API reset complete. Refreshing listings...",
      );
      await fetchListings();
      return;
    }
    setResetStatus(result.error ?? "Failed to reset API state.");
  }

  return (
    <DashboardShell
      title="Marketplace"
      subtitle="See all available products, search quickly, and inspect on-chain listing details."
    >
      <section className="cyber-card">
        <div className="market-toolbar">
          <div className="search-wrap">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by service, seller, type"
            />
          </div>

          <input
            className="cyber-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="type filter (optional)"
            list="marketplace-type-suggestions"
          />
          <datalist id="marketplace-type-suggestions">
            {[...new Set(listings.map((item) => item.type))].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <input
            className="cyber-budget"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            placeholder="max ALGO"
            inputMode="decimal"
          />

          {/* Refresh button removed in favor of auto-refresh/on-type updates */}
        </div>

        {error && (
          <>
            <p className="status-bad">{error}</p>
            <button className="btn-outline" type="button" onClick={onResetApi}>
              Reset & Fix API
            </button>
          </>
        )}
        {resetStatus && <p className="status-muted">{resetStatus}</p>}
        {warning && <p className="status-muted">{warning}</p>}
        {loading && <p className="status-muted">Loading...</p>}

        <div className="product-grid">
          {filtered.map((item) => (
            <article
              key={item.txId}
              className="cyber-card product-card"
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedItem(item)}
            >
              <div className="product-top">
                <span>{item.type}</span>
                <span
                  className={`rep-pill rep-${reputationTone(
                    sellerRatings[item.seller]?.score,
                    sellerRatings[item.seller]?.count,
                  )}`}
                >
                  Seller Reputation{" "}
                  {formatReputation100(
                    sellerRatings[item.seller]?.score,
                    sellerRatings[item.seller]?.count,
                  )}
                </span>
              </div>
              <h4>{item.service}</h4>
              <p className="code-tag truncate-1">{shortAddress(item.seller)}</p>
              <p className="truncate-1">{item.description}</p>
              <div className="product-bottom">
                <span>{item.price} ALGO</span>
                <a
                  className="btn-outline"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  href={`https://testnet.explorer.perawallet.app/tx/${item.txId}`}
                >
                  Explorer
                </a>
              </div>
            </article>
          ))}
          {!filtered.length && !loading && !error && (
            <p className="status-muted">No products found for these filters.</p>
          )}
        </div>
      </section>

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedItem(null)}
            >
              &times;
            </button>
            <h3>{selectedItem.service}</h3>
            <p
              className="code-tag"
              style={{ marginTop: 0, marginBottom: "0.4rem" }}
            >
              Type: {formatTypeLabel(selectedItem.type)}
            </p>
            <div className="modal-reputation-row">
              <span
                className={`rep-pill rep-${reputationTone(
                  sellerRatings[selectedItem.seller]?.score,
                  sellerRatings[selectedItem.seller]?.count,
                )}`}
              >
                Seller Reputation{" "}
                {formatReputation100(
                  sellerRatings[selectedItem.seller]?.score,
                  sellerRatings[selectedItem.seller]?.count,
                )}
              </span>
              <span
                className={`rep-pill rep-${reputationTone(
                  listingRatings[selectedItem.txId]?.score,
                  listingRatings[selectedItem.txId]?.count,
                )}`}
              >
                Product Reputation{" "}
                {formatReputation100(
                  listingRatings[selectedItem.txId]?.score,
                  listingRatings[selectedItem.txId]?.count,
                )}
              </span>
            </div>
            <p
              className="status-muted"
              style={{ marginTop: 0, marginBottom: "0.5rem" }}
            >
              Seller reputation is calculated from buyer feedback history and
              shown on a 0-100 scale.
            </p>
            <p
              className="status-muted"
              style={{ marginTop: 0, marginBottom: "0.5rem" }}
            >
              {reputationDetails(sellerRatings[selectedItem.seller]?.count)}
            </p>
            <p className="code-tag" style={{ wordBreak: "break-all" }}>
              Seller: {selectedItem.seller}
            </p>
            <div
              style={{
                maxHeight: "40vh",
                overflowY: "auto",
                paddingRight: "0.5rem",
              }}
            >
              <p>
                <strong style={{ color: "var(--accent)" }}>Description:</strong>
                <br />
                {selectedItem.description}
              </p>
            </div>
            <p>
              <strong style={{ color: "var(--accent)" }}>Price:</strong>{" "}
              {selectedItem.price} ALGO
            </p>
            <p>
              <strong style={{ color: "var(--accent)" }}>Delivery:</strong>{" "}
              {selectedItem.deliveryKind ?? "other"}
              {selectedItem.accessDurationDays !== undefined
                ? ` • ${selectedItem.accessDurationDays} days`
                : ""}
            </p>
            <div className="modal-actions-row">
              <a
                className="btn-outline"
                target="_blank"
                rel="noreferrer"
                href={`https://testnet.explorer.perawallet.app/tx/${selectedItem.txId}`}
                style={{ display: "inline-flex", justifyContent: "center" }}
              >
                View on Explorer
              </a>
              <button
                className="btn-neon"
                type="button"
                disabled={!canBuy}
                onClick={buySelected}
              >
                {purchasing ? "Buying..." : "Buy"}
              </button>
            </div>
            {!activeAccount?.address && (
              <p className="status-muted">Connect wallet to purchase.</p>
            )}

            {purchaseMsg && (
              <p className="status-good" style={{ marginTop: "0.75rem" }}>
                <CheckCircle2 size={14} /> {purchaseMsg} — go to Orders.
              </p>
            )}
            {error && (
              <p className="status-bad" style={{ marginTop: "0.75rem" }}>
                <AlertTriangle size={14} /> {error}
              </p>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
