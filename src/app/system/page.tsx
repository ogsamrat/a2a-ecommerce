"use client";

import { useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { Activity, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function SystemPage() {
  const { activeAccount } = useWallet();
  const [initResult, setInitResult] = useState<string>("");
  const [walletInfo, setWalletInfo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function initializeDemo() {
    setLoading(true);
    try {
      const res = await fetch("/api/init", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Init failed");
      setInitResult(
        `Initialized with ${data.listingTxIds?.length ?? 0} seed listings`,
      );
    } catch (error) {
      setInitResult(error instanceof Error ? error.message : "Init failed");
    } finally {
      setLoading(false);
    }
  }

  async function checkWallet() {
    if (!activeAccount) {
      setWalletInfo("Connect wallet first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/wallet/info?address=${activeAccount.address}`,
      );
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error ?? "Wallet info failed");
      setWalletInfo(`${data.address} • ${data.balance} ALGO • ${data.network}`);
    } catch (error) {
      setWalletInfo(
        error instanceof Error ? error.message : "Wallet info failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="System"
      subtitle="Operational controls and health checks for API routes and wallet integration."
    >
      <section className="section-grid no-skew">
        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Activity size={18} />
            <h3>Controls</h3>
          </div>
          <div className="hero-actions">
            <button className="btn-neon" onClick={initializeDemo} type="button">
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Init Demo Accounts
            </button>
            <button className="btn-outline" onClick={checkWallet} type="button">
              Check Wallet Info
            </button>
          </div>
          {initResult && <p className="status-muted">{initResult}</p>}
          {walletInfo && <p className="status-muted">{walletInfo}</p>}
        </article>

        <article className="cyber-card">
          <h3>Route Summary</h3>
          <ul className="timeline-list">
            <li>POST /api/listings/create builds unsigned listing tx</li>
            <li>GET /api/listings/fetch lists products from indexer</li>
            <li>POST /api/intent + /discover + /negotiate powers agent flow</li>
            <li>POST /api/wallet/prepare-payment + /submit settles purchase</li>
          </ul>
        </article>
      </section>
    </DashboardShell>
  );
}
