"use client";

import { useState, useEffect } from "react";
import type { OnChainListing } from "@/lib/agents/types";

const SERVICE_TYPES = [
  { value: "", label: "All Services" },
  { value: "cloud-storage", label: "Cloud Storage" },
  { value: "api-access", label: "API Access" },
  { value: "compute", label: "GPU Compute" },
  { value: "hosting", label: "Hosting" },
];

function ListingRow({ listing, index }: { listing: OnChainListing; index: number }) {
  const explorerUrl = `https://lora.algokit.io/testnet/transaction/${listing.txId}`;
  return (
    <div
      className="group border border-zinc-800/60 rounded-xl p-4 hover:border-zinc-700 transition-all animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">{listing.service}</h3>
            {listing.zkCommitment && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                ZK
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 line-clamp-1 mb-2">{listing.description}</p>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span className="uppercase tracking-wider">{listing.type}</span>
            <span>Round {listing.round}</span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500/70 hover:text-blue-400 transition-colors"
            >
              {listing.txId.slice(0, 12)}...
            </a>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-zinc-100">{listing.price}</p>
          <p className="text-[10px] text-zinc-500">ALGO</p>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceBrowser() {
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  async function fetchListings() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("type", filter);
      const res = await fetch(`/api/listings/fetch?${params}`);
      const data = await res.json();
      setListings(data.listings ?? []);
      setHasSearched(true);
    } catch {
      setListings([]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    fetchListings();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:border-zinc-600 transition-colors"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={fetchListings}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 border border-zinc-700/50 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Search Indexer"}
        </button>
        <span className="text-[10px] text-zinc-600 ml-auto">
          {listings.length} listing{listings.length !== 1 ? "s" : ""} found
        </span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-zinc-900/50 animate-shimmer border border-zinc-800/30" />
          ))}
        </div>
      )}

      {!isLoading && listings.length > 0 && (
        <div className="space-y-2">
          {listings.map((l, i) => (
            <ListingRow key={l.txId} listing={l} index={i} />
          ))}
        </div>
      )}

      {!isLoading && hasSearched && listings.length === 0 && (
        <div className="text-center py-12 text-zinc-600 text-sm">
          No listings found on-chain. Run the pipeline first to seed data.
        </div>
      )}
    </div>
  );
}
