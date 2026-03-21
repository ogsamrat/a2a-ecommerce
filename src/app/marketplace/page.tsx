"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest, resetApiState } from "@/lib/api/client";
import type { OnChainListing } from "@/lib/agents/types";

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [reputationByAgent, setReputationByAgent] = useState<
    Record<string, number>
  >({});
  const [type, setType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const hasInitialized = useRef(false);

  const loadReputations = useCallback(async (items: OnChainListing[]) => {
    const agents = [
      ...new Set(items.map((item) => item.seller).filter(Boolean)),
    ];
    if (!agents.length) {
      setReputationByAgent({});
      return;
    }

    try {
      const data = await apiRequest<{
        results?: Array<{ agent: string; reputation: number }>;
      }>("/api/reputation/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents }),
      });

      const next: Record<string, number> = {};
      for (const item of data.results ?? []) {
        next[item.agent] = item.reputation;
      }
      setReputationByAgent(next);
    } catch {
      setReputationByAgent({});
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
      await loadReputations(nextListings);
    } catch (err) {
      setError(asError(err));
      setListings([]);
      setReputationByAgent({});
    } finally {
      setLoading(false);
    }
  }, [loadReputations, maxBudget, type]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    void fetchListings();
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

  function formatReputation(reputation: number | undefined): string {
    if (reputation === undefined) return "Reputation N/A";
    const normalized = reputation > 100 ? reputation / 100 : reputation;
    return `Reputation ${normalized.toFixed(2)}/100`;
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
        {warning && <p className="status-muted">{warning}</p>}

        <div className="product-grid">
          {filtered.map((item) => (
            <article key={item.txId} className="cyber-card product-card">
              <div className="product-top">
                <span>{item.type}</span>
                <span>{formatReputation(reputationByAgent[item.seller])}</span>
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
