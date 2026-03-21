"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest, resetApiState } from "@/lib/api/client";
import type { OnChainListing } from "@/lib/agents/types";

const TYPES = ["", "cloud-storage", "api-access", "compute", "hosting"];

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [type, setType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const hasInitialized = useRef(false);

  const initDemoMarketplace = useCallback(async () => {
    try {
      await apiRequest<{ success?: boolean }>("/api/init", { method: "POST" });
    } catch {
      // Ignore init failures here; fetch endpoint will still return a safe response.
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError("");
    setResetStatus("");
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (maxBudget.trim()) params.set("maxBudget", maxBudget.trim());

      const data = await apiRequest<{ listings?: OnChainListing[] }>(
        `/api/listings/fetch?${params.toString()}`,
      );
      setListings(data.listings ?? []);
    } catch (err) {
      setError(asError(err));
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [maxBudget, type]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    void fetchListings();
    void initDemoMarketplace().then(() => {
      void fetchListings();
    });
  }, [fetchListings, initDemoMarketplace]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((item) =>
      [item.service, item.seller, item.description, item.type].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }, [listings, query]);

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

          <select
            className="cyber-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t || "all"}
              </option>
            ))}
          </select>

          <input
            className="cyber-budget"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            placeholder="max ALGO"
            inputMode="decimal"
          />

          <button className="btn-outline" type="button" onClick={fetchListings}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
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

        <div className="product-grid">
          {filtered.map((item) => (
            <article key={item.txId} className="cyber-card product-card">
              <div className="product-top">
                <span>{item.type}</span>
                <span>Round {item.round}</span>
              </div>
              <h4>{item.service}</h4>
              <p>{item.seller}</p>
              <p>{item.description}</p>
              <div className="product-bottom">
                <span>{item.price} ALGO</span>
                <a
                  className="btn-outline"
                  target="_blank"
                  rel="noreferrer"
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
    </DashboardShell>
  );
}
