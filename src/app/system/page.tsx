"use client";

import { FormEvent, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { Activity, Sparkles, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  apiRequest,
  decodeTxnB64,
  encodeTxnB64,
  resetApiState,
} from "@/lib/api/client";

interface ReputationData {
  agent: string;
  appId: number;
  isRegistered: boolean;
  reputation: number;
  feedbackCount: number;
  totalScore: number;
  isActive: boolean;
  registeredAt?: number;
}

interface PremiumAnalyzeData {
  recommendation?: string;
  expectedDiscount?: string;
  bestTimeToNegotiate?: string;
  riskLevel?: string;
}

export default function SystemPage() {
  const { activeAccount, signTransactions } = useWallet();

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletNetwork, setWalletNetwork] = useState("");

  const [agentToQuery, setAgentToQuery] = useState("");
  const [queryResult, setQueryResult] = useState<ReputationData | null>(null);

  const [feedbackAgent, setFeedbackAgent] = useState("");
  const [feedbackScore, setFeedbackScore] = useState("85");

  const [premiumType, setPremiumType] = useState("cloud-storage");
  const [premiumBudget, setPremiumBudget] = useState("1");
  const [premiumData, setPremiumData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [premiumAnalysis, setPremiumAnalysis] =
    useState<PremiumAnalyzeData | null>(null);

  async function signAndSubmit(unsignedTxn: string): Promise<string> {
    if (!activeAccount) {
      throw new Error("Connect wallet to sign transactions.");
    }
    const signed = (await signTransactions([decodeTxnB64(unsignedTxn)]))[0];
    if (!signed) throw new Error("Wallet signature was empty.");

    const submitData = await apiRequest<{ txId: string }>(
      "/api/wallet/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: encodeTxnB64(signed) }),
      },
    );

    return submitData.txId;
  }

  async function onFetchWalletInfo() {
    if (!activeAccount) {
      setError("Connect wallet first.");
      return;
    }

    setError("");
    setStatus("Loading wallet info...");
    try {
      const data = await apiRequest<{ balance: number; network: string }>(
        `/api/wallet/info?address=${encodeURIComponent(activeAccount.address)}`,
      );
      setWalletBalance(data.balance);
      setWalletNetwork(data.network);
      setStatus("Wallet info loaded.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Wallet info request failed",
      );
      setStatus("");
    }
  }

  async function onQueryReputation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agentToQuery.trim()) return;

    setError("");
    setStatus("Querying reputation...");
    try {
      const data = await apiRequest<ReputationData>(
        `/api/reputation/query?agent=${encodeURIComponent(agentToQuery.trim())}`,
      );
      setQueryResult(data);
      setStatus("Reputation query complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reputation query failed");
      setStatus("");
    }
  }

  async function onRegisterAgent() {
    if (!activeAccount) {
      setError("Connect wallet before registering.");
      return;
    }

    setError("");
    setStatus("Preparing register transaction...");
    try {
      const data = await apiRequest<{ unsignedTxn: string }>(
        "/api/reputation/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderAddress: activeAccount.address }),
        },
      );
      const txId = await signAndSubmit(data.unsignedTxn);
      setStatus(`Registration submitted: ${txId}`);
      setAgentToQuery(activeAccount.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStatus("");
    }
  }

  async function onSubmitFeedback(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeAccount) {
      setError("Connect wallet before submitting feedback.");
      return;
    }

    const score = Number(feedbackScore);
    if (!feedbackAgent.trim() || !Number.isFinite(score)) {
      setError("Provide target agent and valid score.");
      return;
    }

    setError("");
    setStatus("Preparing feedback transaction...");
    try {
      const data = await apiRequest<{ unsignedTxn: string }>(
        "/api/reputation/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: activeAccount.address,
            agentAddress: feedbackAgent.trim(),
            score,
          }),
        },
      );
      const txId = await signAndSubmit(data.unsignedTxn);
      setStatus(`Feedback submitted: ${txId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback failed");
      setStatus("");
    }
  }

  async function onLoadPremiumData() {
    setError("");
    setStatus("Loading premium data...");
    try {
      const data =
        await apiRequest<Record<string, unknown>>("/api/premium/data");
      setPremiumData(data);
      setStatus("Premium market data loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Premium data failed");
      setStatus("");
    }
  }

  async function onAnalyzePremium(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setStatus("Running premium analysis...");
    try {
      const data = await apiRequest<{ analysis?: PremiumAnalyzeData }>(
        "/api/premium/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceType: premiumType,
            maxBudget: Number(premiumBudget),
          }),
        },
      );
      setPremiumAnalysis(data.analysis ?? null);
      setStatus("Premium analysis complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Premium analysis failed");
      setStatus("");
    }
  }

  async function onResetApi() {
    setError("");
    setStatus("Resetting API state...");
    const result = await resetApiState();
    if (result.ok) {
      setStatus(result.warning ?? "API reset complete.");
      return;
    }
    setError(result.error ?? "API reset failed");
    setStatus("");
  }

  return (
    <DashboardShell
      title="System & Premium"
      subtitle="Use all operational APIs from one page: wallet, reputation, premium analytics, and reset/reinitialize."
    >
      <section className="section-grid no-skew">
        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Wallet size={18} />
            <h3>Wallet + Reputation</h3>
          </div>

          <button
            className="btn-outline"
            type="button"
            onClick={onFetchWalletInfo}
          >
            Fetch Wallet Info
          </button>
          {walletBalance !== null && (
            <p className="status-muted">
              Balance: {walletBalance.toFixed(4)} ALGO ({walletNetwork || "-"})
            </p>
          )}

          <form className="cyber-form" onSubmit={onQueryReputation}>
            <label>
              <span>QUERY AGENT REPUTATION</span>
              <input
                value={agentToQuery}
                onChange={(e) => setAgentToQuery(e.target.value)}
                placeholder="Agent address"
                required
              />
            </label>
            <button className="btn-outline" type="submit">
              Query Reputation
            </button>
          </form>

          <button className="btn-neon" type="button" onClick={onRegisterAgent}>
            Register Active Wallet as Agent
          </button>

          <form className="cyber-form" onSubmit={onSubmitFeedback}>
            <label>
              <span>FEEDBACK TARGET AGENT</span>
              <input
                value={feedbackAgent}
                onChange={(e) => setFeedbackAgent(e.target.value)}
                placeholder="Agent address"
                required
              />
            </label>
            <label>
              <span>FEEDBACK SCORE (0-100)</span>
              <input
                value={feedbackScore}
                onChange={(e) => setFeedbackScore(e.target.value)}
                inputMode="numeric"
                required
              />
            </label>
            <button className="btn-outline" type="submit">
              Submit Feedback
            </button>
          </form>

          {queryResult && (
            <div className="list-item">
              <p>Reputation: {queryResult.reputation}</p>
              <span>
                Registered: {queryResult.isRegistered ? "yes" : "no"} •
                Feedback: {queryResult.feedbackCount}
              </span>
            </div>
          )}
        </article>

        <article className="cyber-card">
          <div className="section-head">
            <Sparkles size={18} />
            <h3>Premium x402 Endpoints</h3>
          </div>

          <button
            className="btn-outline"
            type="button"
            onClick={onLoadPremiumData}
          >
            Load Premium Market Data
          </button>
          {premiumData && (
            <pre className="chat-log">
              {JSON.stringify(premiumData, null, 2)}
            </pre>
          )}

          <form className="cyber-form" onSubmit={onAnalyzePremium}>
            <label>
              <span>SERVICE TYPE</span>
              <input
                value={premiumType}
                onChange={(e) => setPremiumType(e.target.value)}
                placeholder="cloud-storage"
                required
              />
            </label>
            <label>
              <span>MAX BUDGET</span>
              <input
                value={premiumBudget}
                onChange={(e) => setPremiumBudget(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            <button className="btn-neon" type="submit">
              Analyze Premium Market
            </button>
          </form>

          {premiumAnalysis && (
            <div className="list-stack">
              <div className="list-item">
                <p>Recommendation</p>
                <span>{premiumAnalysis.recommendation ?? "-"}</span>
              </div>
              <div className="list-item">
                <p>Expected Discount</p>
                <span>{premiumAnalysis.expectedDiscount ?? "-"}</span>
              </div>
              <div className="list-item">
                <p>Best Time</p>
                <span>{premiumAnalysis.bestTimeToNegotiate ?? "-"}</span>
              </div>
              <div className="list-item">
                <p>Risk Level</p>
                <span>{premiumAnalysis.riskLevel ?? "-"}</span>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="cyber-card terminal-panel">
        <div className="section-head">
          <Activity size={18} />
          <h3>API Recovery</h3>
          <button className="btn-outline" type="button" onClick={onResetApi}>
            Reset & Fix API
          </button>
        </div>

        {status && <p className="status-good">{status}</p>}
        {error && <p className="status-bad">{error}</p>}
        {!activeAccount && (
          <p className="status-muted">
            Connect wallet to use register/feedback transaction endpoints.
          </p>
        )}
        <p className="status-muted">
          This page integrates: /api/wallet/info, /api/reputation/query,
          /api/reputation/register, /api/reputation/feedback, /api/premium/data,
          /api/premium/analyze, and reset via /api/init.
        </p>
      </section>
    </DashboardShell>
  );
}
