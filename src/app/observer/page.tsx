"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Radar, ShieldCheck, Timer } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiRequest } from "@/lib/api/client";

interface ObserverSummary {
  network: string;
  observedAt: string;
  listingsCount: number;
  uniqueSellers: number;
  avgPrice: number;
  zkCoveragePct: number;
  latestRound: number;
  typeBreakdown: Array<{ type: string; count: number; avgPrice: number }>;
  warning?: string;
}

interface ObserverActivityItem {
  txId: string;
  seller: string;
  service: string;
  type: string;
  price: number;
  round: number;
  timestamp: number;
  zkVerified: boolean;
}

interface ObserverActivity {
  network: string;
  observedAt: string;
  activities: ObserverActivityItem[];
  count: number;
  warning?: string;
}

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown observer error";
}

function shortAddress(address: string): string {
  if (address.length < 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function ObserverPage() {
  const [summary, setSummary] = useState<ObserverSummary | null>(null);
  const [activity, setActivity] = useState<ObserverActivityItem[]>([]);
  const [network, setNetwork] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchObserver = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");

    try {
      const [summaryData, activityData] = await Promise.all([
        apiRequest<ObserverSummary>("/api/observer/summary"),
        apiRequest<ObserverActivity>("/api/observer/activity?limit=20"),
      ]);

      setSummary(summaryData);
      setActivity(activityData.activities ?? []);
      setNetwork(summaryData.network || activityData.network || "-");
      setObservedAt(summaryData.observedAt || activityData.observedAt || "");
      setWarning(summaryData.warning ?? activityData.warning ?? "");
    } catch (err) {
      setError(asError(err));
      setSummary(null);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchObserver();
  }, [fetchObserver]);

  const topTypes = useMemo(() => summary?.typeBreakdown ?? [], [summary]);

  return (
    <DashboardShell
      title="Observer"
      subtitle="Monitor live on-chain marketplace activity, listing density, seller participation, and settlement-relevant signals."
    >
      <section className="section-grid no-skew">
        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Radar size={18} />
            <h3>Network Observer</h3>
            <button
              className="btn-outline"
              type="button"
              onClick={fetchObserver}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="list-stack">
            <div className="list-item">
              <p>Network</p>
              <span>{network || "-"}</span>
            </div>
            <div className="list-item">
              <p>Observed At</p>
              <span>
                {observedAt ? new Date(observedAt).toLocaleString() : "-"}
              </span>
            </div>
            <div className="list-item">
              <p>Total Listings Observed</p>
              <span>{summary?.listingsCount ?? 0}</span>
            </div>
            <div className="list-item">
              <p>Unique Sellers</p>
              <span>{summary?.uniqueSellers ?? 0}</span>
            </div>
            <div className="list-item">
              <p>Average Price</p>
              <span>{(summary?.avgPrice ?? 0).toFixed(4)} ALGO</span>
            </div>
            <div className="list-item">
              <p>ZK Coverage</p>
              <span>{summary?.zkCoveragePct ?? 0}%</span>
            </div>
            <div className="list-item">
              <p>Latest Confirmed Round</p>
              <span>{summary?.latestRound ?? 0}</span>
            </div>
          </div>

          {warning && <p className="status-muted">{warning}</p>}
          {error && <p className="status-bad">{error}</p>}
        </article>

        <article className="cyber-card">
          <div className="section-head">
            <Activity size={18} />
            <h3>Type Breakdown</h3>
          </div>

          <div className="list-stack">
            {topTypes.map((entry) => (
              <div key={entry.type} className="list-item">
                <p>{entry.type}</p>
                <span>
                  {entry.count} listing(s) • {entry.avgPrice.toFixed(4)} ALGO
                  avg
                </span>
              </div>
            ))}
            {!topTypes.length && !loading && (
              <p className="status-muted">No on-chain listing type data yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="cyber-card">
        <div className="section-head">
          <Timer size={18} />
          <h3>Recent On-Chain Listing Activity</h3>
        </div>

        <div className="list-stack">
          {activity.map((item) => (
            <div key={item.txId} className="list-item">
              <div style={{ flex: 1 }}>
                <p>{item.service}</p>
                <span>
                  {item.type} • {item.price} ALGO • {shortAddress(item.seller)}{" "}
                  • round {item.round} • {item.zkVerified ? "ZK" : "No ZK"}
                </span>
              </div>
              <a
                href={`https://lora.algokit.io/testnet/transaction/${item.txId}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "14px",
                  textDecoration: "underline",
                  color: "var(--neon-blue)",
                  alignSelf: "center",
                  marginLeft: "10px",
                }}
              >
                View Tx
              </a>
            </div>
          ))}
          {!activity.length && !loading && (
            <p className="status-muted">
              No on-chain listing activity detected yet.
            </p>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
