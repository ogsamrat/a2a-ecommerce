"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { ArrowRight, Bot, CircleCheckBig, LoaderCircle, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
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

function parseError(res: Response, data: unknown): Error {
  const error =
    typeof data === "object" && data !== null && "error" in data
      ? String((data as { error?: unknown }).error)
      : `Request failed (${res.status})`;
  return new Error(error);
}

export default function ChatPage() {
  const { activeAccount, signTransactions } = useWallet();
  const [initialized, setInitialized] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoBuy, setAutoBuy] = useState(true);

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [bestDeal, setBestDeal] = useState<NegotiationSession | null>(null);
  const [escrow, setEscrow] = useState<EscrowState>(emptyEscrow);
  const [error, setError] = useState("");

  const discoveredCount = useMemo(() => listings.length, [listings.length]);

  async function executeDeal(deal: NegotiationSession) {
    if (activeAccount) {
      const prepareRes = await fetch("/api/wallet/prepare-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: activeAccount.address,
          receiverAddress: deal.sellerAddress,
          amountAlgo: deal.finalPrice,
          note: `A2A Commerce | ${deal.service} | ${deal.finalPrice} ALGO`,
        }),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok || prepareData.error) throw parseError(prepareRes, prepareData);

      const unsignedTxn = Uint8Array.from(atob(prepareData.unsignedTxn), (c) => c.charCodeAt(0));
      const signed = (await signTransactions([unsignedTxn]))[0];
      if (!signed) throw new Error("Wallet signature was empty");
      const signedB64 = btoa(String.fromCharCode(...Array.from(signed)));

      const submitRes = await fetch("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok || submitData.error) throw parseError(submitRes, submitData);

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

    const executeRes = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal }),
    });
    const executeData = await executeRes.json();
    if (!executeRes.ok || executeData.error) throw parseError(executeRes, executeData);
    setEscrow(executeData.escrow ?? emptyEscrow);
  }

  async function runPipeline(message: string) {
    setBusy(true);
    setError("");
    setActions([]);
    setEscrow(emptyEscrow);
    setBestDeal(null);

    try {
      if (!initialized) {
        const initRes = await fetch("/api/init", { method: "POST" });
        const initData = await initRes.json();
        if (!initRes.ok || initData.error) throw parseError(initRes, initData);
        setInitialized(true);
        setActions((prev) => [...prev, ...(initData.actions ?? [])]);
      }

      const intentRes = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok || intentData.error) throw parseError(intentRes, intentData);
      setIntent(intentData.intent ?? null);
      setActions((prev) => [...prev, ...(intentData.actions ?? [])]);

      const discoverRes = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intentData.intent }),
      });
      const discoverData = await discoverRes.json();
      if (!discoverRes.ok || discoverData.error) throw parseError(discoverRes, discoverData);
      setListings(discoverData.listings ?? []);
      setActions((prev) => [...prev, ...(discoverData.actions ?? [])]);

      if (!(discoverData.listings ?? []).length) return;

      const negotiateRes = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intentData.intent, listings: discoverData.listings }),
      });
      const negotiateData = await negotiateRes.json();
      if (!negotiateRes.ok || negotiateData.error) throw parseError(negotiateRes, negotiateData);
      setActions((prev) => [...prev, ...(negotiateData.actions ?? [])]);

      const selected = negotiateData.bestDeal as NegotiationSession | null;
      setBestDeal(selected);

      if (selected && autoBuy) {
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

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={autoBuy}
                onChange={(e) => setAutoBuy(e.target.checked)}
              />
              Auto-buy after best deal
            </label>

            <button className="btn-neon" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}
              Run Agent Flow
            </button>
          </form>

          {error && <p className="status-bad">{error}</p>}
          {intent && <p className="status-muted">Intent: {intent.serviceType} under {intent.maxBudget} ALGO</p>}
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
                <span>&gt; {action.agentName.toUpperCase()}:</span> {action.content}
              </p>
            ))}
            {!actions.length && <p className="status-muted">No events yet. Run a prompt to start.</p>}
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
