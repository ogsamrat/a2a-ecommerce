"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  ArrowRight,
  Bot,
  CircleCheckBig,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  apiRequest,
  decodeTxnB64,
  encodeTxnB64,
  resetApiState,
} from "@/lib/api/client";
import type {
  AgentAction,
  EscrowState,
  NegotiationSession,
  OnChainListing,
  ParsedIntent,
} from "@/lib/agents/types";

const emptyEscrow: EscrowState = {
  status: "idle",
  buyerAddress: "",
  sellerAddress: "",
  amount: 0,
  txId: "",
  confirmedRound: 0,
};

export default function ChatPage() {
  const { activeAccount, signTransactions } = useWallet();
  const [initialized, setInitialized] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [bestDeal, setBestDeal] = useState<NegotiationSession | null>(null);
  const [escrow, setEscrow] = useState<EscrowState>(emptyEscrow);
  const [error, setError] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  const discoveredCount = useMemo(() => listings.length, [listings.length]);

  async function executeDeal(deal: NegotiationSession) {
    if (activeAccount) {
      const prepareData = await apiRequest<{ unsignedTxn: string }>(
        "/api/wallet/prepare-payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: activeAccount.address,
            receiverAddress: deal.sellerAddress,
            amountAlgo: deal.finalPrice,
            note: `AgentDEX | ${deal.service} | ${deal.finalPrice} ALGO`,
          }),
        },
      );

      const unsignedTxn = decodeTxnB64(prepareData.unsignedTxn);
      const signed = (await signTransactions([unsignedTxn]))[0];
      if (!signed) throw new Error("Wallet signature was empty");
      const signedB64 = encodeTxnB64(signed);

      const submitData = await apiRequest<{
        txId: string;
        confirmedRound: number;
      }>("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });

      setEscrow({
        status: "released",
        buyerAddress: activeAccount.address,
        sellerAddress: deal.sellerAddress,
        amount: deal.finalPrice,
        txId: submitData.txId,
        confirmedRound: submitData.confirmedRound,
      });
      return;
    }

    const executeData = await apiRequest<{ escrow?: EscrowState }>(
      "/api/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal }),
      },
    );
    setEscrow(executeData.escrow ?? emptyEscrow);
  }

  async function runPipeline(message: string) {
    setBusy(true);
    setError("");
    setResetStatus("");
    setActions([]);
    setEscrow(emptyEscrow);
    setBestDeal(null);

    try {
      if (!initialized) {
        const initData = await apiRequest<{ actions?: AgentAction[] }>(
          "/api/init",
          { method: "POST" },
        );
        setInitialized(true);
        setActions((prev) => [...prev, ...(initData.actions ?? [])]);
      }

      const intentData = await apiRequest<{
        intent?: ParsedIntent;
        actions?: AgentAction[];
      }>("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setIntent(intentData.intent ?? null);
      setActions((prev) => [...prev, ...(intentData.actions ?? [])]);

      const discoverData = await apiRequest<{
        listings?: OnChainListing[];
        actions?: AgentAction[];
      }>("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intentData.intent }),
      });
      setListings(discoverData.listings ?? []);
      setActions((prev) => [...prev, ...(discoverData.actions ?? [])]);

      if (!(discoverData.listings ?? []).length) return;

      const negotiateData = await apiRequest<{
        bestDeal: NegotiationSession | null;
        actions?: AgentAction[];
      }>("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: intentData.intent,
          listings: discoverData.listings,
        }),
      });
      setActions((prev) => [...prev, ...(negotiateData.actions ?? [])]);

      const selected = negotiateData.bestDeal as NegotiationSession | null;
      setBestDeal(selected);

      if (selected) {
        await executeDeal(selected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent flow failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = prompt.trim();
    if (!message || busy) return;
    await runPipeline(message);
  }

  async function onResetApi() {
    setResetStatus("Resetting API state...");
    const result = await resetApiState();
    if (result.ok) {
      setInitialized(true);
      setError("");
      setActions([]);
      setIntent(null);
      setListings([]);
      setBestDeal(null);
      setEscrow(emptyEscrow);
      setResetStatus(
        result.warning ?? "API reset complete. Run the flow again.",
      );
      return;
    }
    setResetStatus(result.error ?? "Unable to reset API state.");
  }

  return (
    <DashboardShell
      title="Agent Chat"
      subtitle="Describe what to buy and let the agent discover, compare, negotiate, and execute the purchase."
    >
      <section className="section-grid no-skew">
        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Bot size={18} />
            <h3>Buyer Prompt</h3>
          </div>

          <form className="cyber-form" onSubmit={onSubmit}>
            <label>
              <span>INTENT MESSAGE</span>
              <textarea
                className="cyber-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="> Buy cloud storage under 1 ALGO"
                required
              />
            </label>

            <button className="btn-neon" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              Run Agent Flow
            </button>
          </form>

          {error && (
            <>
              <p className="status-bad">{error}</p>
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
          {intent && (
            <p className="status-muted">
              Intent: {intent.serviceType} under {intent.maxBudget} ALGO
            </p>
          )}
          <p className="status-muted">Discovered listings: {discoveredCount}</p>

          {bestDeal && (
            <div className="list-item">
              <p>Best deal: {bestDeal.sellerName}</p>
              <span>
                {bestDeal.finalPrice} ALGO (from {bestDeal.originalPrice} ALGO)
              </span>
            </div>
          )}

          {escrow.txId && (
            <div className="status-good">
              <CircleCheckBig size={14} />
              Payment complete: {escrow.txId}
            </div>
          )}
        </article>

        <article className="cyber-card">
          <div className="section-head">
            <Wallet size={18} />
            <h3>Chat Timeline</h3>
          </div>

          <div className="chat-log">
            {actions.map((action) => (
              <p key={action.id}>
                <span>&gt; {action.agentName.toUpperCase()}:</span>{" "}
                {action.content}
              </p>
            ))}
            {!actions.length && (
              <p className="status-muted">
                No events yet. Run a prompt to start.
              </p>
            )}
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
