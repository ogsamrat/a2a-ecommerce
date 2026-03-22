"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { ChatInterface } from "@/components/chat-interface";
import { NegotiationTimeline } from "@/components/negotiation-timeline";
import { TransactionStatus } from "@/components/transaction-status";
import { ListingCard } from "@/components/seller-card";
import {
  Send,
  Bot,
  Zap,
  X,
  CheckCircle,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type {
  SessionState,
  AgentAction,
  ParsedIntent,
  OnChainListing,
  NegotiationSession,
  EscrowState,
} from "@/lib/agents/types";

const EMPTY_ESCROW: EscrowState = {
  status: "idle",
  buyerAddress: "",
  sellerAddress: "",
  amount: 0,
  txId: "",
  confirmedRound: 0,
};
const INIT_STATE: SessionState = {
  sessionId: "",
  intent: null,
  listings: [],
  negotiations: [],
  selectedDeal: null,
  escrow: EMPTY_ESCROW,
  actions: [],
  phase: "idle",
  autoBuy: false,
};

const PHASE_LABEL: Record<string, { text: string; color: string }> = {
  idle: { text: "Ready", color: "var(--text-4)" },
  parsing: { text: "Parsing…", color: "var(--blue-bright)" },
  initializing: { text: "Initializing…", color: "var(--blue-bright)" },
  discovering: { text: "Discovering…", color: "#a78bfa" },
  negotiating: { text: "Negotiating…", color: "#fbbf24" },
  executing: { text: "Executing…", color: "var(--green)" },
  completed: { text: "Done", color: "var(--green)" },
  error: { text: "Error", color: "#ff6b6b" },
};

interface VaultPolicyView {
  maxPerOrderAlgo: number;
  dailyCapAlgo: number;
  allowedSellers: string[];
  allowedServices: string[];
  expiresAt?: string;
}

interface VaultAccountView {
  buyerAddress: string;
  balanceAlgo: number;
  policy: VaultPolicyView;
}

export function ChatSection() {
  const { activeAccount, signTransactions } = useWallet();
  const [mounted, setMounted] = useState(false);

  const currentAccount = mounted ? activeAccount : null;

  const [state, setState] = useState<SessionState>(INIT_STATE);
  const [loading, setLoading] = useState(false);
  const [inited, setInited] = useState(false);
  const [msg, setMsg] = useState("");
  const [vault, setVault] = useState<VaultAccountView | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [funding, setFunding] = useState(false);
  const [depositAmount, setDepositAmount] = useState("1");
  const [policySaving, setPolicySaving] = useState(false);
  const [maxPerOrder, setMaxPerOrder] = useState("1");
  const [dailyCap, setDailyCap] = useState("5");
  const [allowedSellersText, setAllowedSellersText] = useState("");
  const [allowedServicesText, setAllowedServicesText] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshVault = useCallback(async () => {
    if (!currentAccount?.address) {
      setVault(null);
      return;
    }

    setVaultLoading(true);
    try {
      const r = await fetch(
        `/api/vault/status?buyerAddress=${encodeURIComponent(currentAccount.address)}`,
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setVault(d.account ?? null);
      if (d.account?.policy) {
        setMaxPerOrder(String(d.account.policy.maxPerOrderAlgo ?? 1));
        setDailyCap(String(d.account.policy.dailyCapAlgo ?? 5));
        setAllowedSellersText(
          (d.account.policy.allowedSellers ?? []).join(","),
        );
        setAllowedServicesText(
          (d.account.policy.allowedServices ?? []).join(","),
        );
        const rawExpiry = d.account.policy.expiresAt;
        setExpiresAt(
          rawExpiry ? new Date(rawExpiry).toISOString().slice(0, 16) : "",
        );
      }
    } catch (e) {
      sysAction(
        `**Vault Status Error:** ${e instanceof Error ? e.message : "Failed"}`,
        "result",
      );
    } finally {
      setVaultLoading(false);
    }
  }, [currentAccount?.address]);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  /* ── Helpers ── */
  const addActions = useCallback(
    (acts: AgentAction[]) =>
      setState((p) => ({ ...p, actions: [...p.actions, ...acts] })),
    [],
  );

  function sysAction(content: string, type: AgentAction["type"] = "message") {
    addActions([
      {
        id: crypto.randomUUID(),
        agent: "system",
        agentName: "System",
        type,
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  async function api<T>(
    url: string,
    body: Record<string, unknown>,
    phase: SessionState["phase"],
  ): Promise<T | null> {
    setState((p) => ({ ...p, phase }));
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.actions) addActions(d.actions);
      return d as T;
    } catch (e) {
      addActions([
        {
          id: crypto.randomUUID(),
          agent: "system",
          agentName: "System",
          type: "result",
          content: `**Error:** ${e instanceof Error ? e.message : "unknown"}`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setState((p) => ({ ...p, phase: "error" }));
      return null;
    }
  }

  /* ── Submit ── */
  async function submit(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setMsg("");
    setState((p) => ({
      ...INIT_STATE,
      autoBuy: p.autoBuy,
      sessionId: crypto.randomUUID(),
      actions: [
        {
          id: crypto.randomUUID(),
          agent: "user",
          agentName: "You",
          type: "message",
          content: t,
          timestamp: new Date().toISOString(),
        },
      ],
    }));

    if (!inited) {
      const r = await api<{ success?: boolean }>(
        "/api/init",
        {},
        "initializing",
      );
      // Even if init warns (success=false), it's a recoverable warning so we proceed.
      // E.g. we use the real network listings instead of seeded ones.
      if (r === null) {
        setLoading(false);
        return;
      } // Network crash completely
      setInited(true);
      await new Promise((res) => setTimeout(res, 2000));
    }

    const ir = await api<{ intent: ParsedIntent }>(
      "/api/intent",
      { message: t },
      "parsing",
    );
    if (!ir?.intent) {
      setLoading(false);
      return;
    }
    const intent = ir.intent;
    setState((p) => ({ ...p, intent }));

    const dr = await api<{ listings: OnChainListing[] }>(
      "/api/discover",
      { intent },
      "discovering",
    );
    if (!dr?.listings?.length) {
      setState((p) => ({ ...p, phase: "completed" }));
      setLoading(false);
      return;
    }
    const listings = dr.listings;
    setState((p) => ({ ...p, listings }));

    const nr = await api<{
      sessions: NegotiationSession[];
      bestDeal: NegotiationSession | null;
    }>("/api/negotiate", { intent, listings }, "negotiating");
    if (!nr) {
      setLoading(false);
      return;
    }
    setState((p) => ({
      ...p,
      negotiations: nr.sessions,
      selectedDeal: nr.bestDeal,
    }));

    if (!nr.bestDeal) {
      setState((p) => ({ ...p, phase: "completed" }));
      setLoading(false);
      return;
    }

    if (state.autoBuy) {
      await execDeal(nr.bestDeal, true);
    } else {
      addActions([
        {
          id: crypto.randomUUID(),
          agent: "buyer",
          agentName: "Buyer Agent",
          type: "result",
          content: currentAccount
            ? `Best deal: **${nr.bestDeal.finalPrice} ALGO** from **${nr.bestDeal.sellerName}**. Ready to execute — confirm below.`
            : `Best deal: **${nr.bestDeal.finalPrice} ALGO** from **${nr.bestDeal.sellerName}**. Connect your wallet to sign.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setState((p) => ({ ...p, phase: "completed" }));
    }
    setLoading(false);
  }

  async function execDeal(deal: NegotiationSession, isAutoBuy = false) {
    setLoading(true);
    setState((p) => ({ ...p, phase: "executing" }));
    let success = false;
    if (isAutoBuy) {
      if (!currentAccount?.address) {
        sysAction(
          "**Auto-Buy requires a connected wallet** to identify and charge your buyer vault.",
          "result",
        );
        setState((p) => ({ ...p, phase: "error" }));
        setLoading(false);
        return;
      }
      sysAction(
        "Auto-Buy is ON: executing payment via autonomous agent signer…",
        "transaction",
      );
      success = await execServer(deal, true);
    } else if (currentAccount) {
      success = await execWallet(deal);
    } else {
      sysAction(
        "**Wallet required:** connect a wallet for manual purchases, or enable Auto-Buy with funded vault.",
        "result",
      );
      setState((p) => ({ ...p, phase: "error" }));
      setLoading(false);
      return;
    }

    if (success) {
      setState((p) => ({ ...p, phase: "completed" }));
    } else {
      setState((p) => (p.phase === "error" ? p : { ...p, phase: "error" }));
    }
    setLoading(false);
  }

  async function execWallet(deal: NegotiationSession): Promise<boolean> {
    try {
      sysAction(
        `Preparing **${deal.finalPrice} ALGO** payment…`,
        "transaction",
      );
      const prep = await (
        await fetch("/api/wallet/prepare-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: currentAccount!.address,
            receiverAddress: deal.sellerAddress,
            amountAlgo: deal.finalPrice,
            note: `A2A | ${deal.service}`,
          }),
        })
      ).json();
      if (prep.error) throw new Error(prep.error);
      const bytes = Uint8Array.from(atob(prep.unsignedTxn), (c) =>
        c.charCodeAt(0),
      );
      const signed = (await signTransactions([bytes]))[0];
      if (!signed) throw new Error("Wallet returned empty signature");
      const b64 = btoa(String.fromCharCode(...Array.from(signed)));
      sysAction("Signed! Submitting to Algorand…", "transaction");
      const sub = await (
        await fetch("/api/wallet/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTxn: b64 }),
        })
      ).json();
      if (sub.error) throw new Error(sub.error);
      const escrow: EscrowState = {
        status: "released",
        buyerAddress: currentAccount!.address,
        sellerAddress: deal.sellerAddress,
        amount: deal.finalPrice,
        txId: sub.txId,
        confirmedRound: sub.confirmedRound,
      };
      setState((p) => ({ ...p, escrow }));
      addActions([
        {
          id: crypto.randomUUID(),
          agent: "system",
          agentName: "Algorand",
          type: "transaction",
          content: `**Payment Confirmed!**\n- **TX:** \`${sub.txId}\`\n- **Round:** ${sub.confirmedRound}\n- **Amount:** ${deal.finalPrice} ALGO\n${sub.explorerUrl ? `- [View on Explorer](${sub.explorerUrl})` : ""}`,
          data: { escrow },
          timestamp: new Date().toISOString(),
        },
      ]);
      return true;
    } catch (e) {
      sysAction(
        `**Wallet Error:** ${e instanceof Error ? e.message : "Failed"}`,
        "result",
      );
      return false;
    }
  }

  async function execServer(
    deal: NegotiationSession,
    isAutoBuy: boolean,
  ): Promise<boolean> {
    const r = await api<{
      success: boolean;
      escrow: EscrowState;
      vault?: VaultAccountView;
    }>(
      "/api/execute",
      {
        deal,
        autoBuy: isAutoBuy,
        buyerAddress: currentAccount?.address,
      },
      "executing",
    );
    if (!r?.escrow) {
      sysAction(
        isAutoBuy
          ? "**Auto execution failed.** Fund your buyer vault and ensure policy limits allow this spend."
          : "**Server execution failed.** Ensure AVM_PRIVATE_KEY is set and funded for settlement.",
        "result",
      );
      return false;
    }

    setState((p) => ({ ...p, escrow: r.escrow }));
    if (r.vault) setVault(r.vault);
    return true;
  }

  async function fundVault(): Promise<void> {
    if (!currentAccount?.address || funding) return;

    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      sysAction(
        "**Vault Funding Error:** Enter a valid deposit amount.",
        "result",
      );
      return;
    }

    setFunding(true);
    try {
      const prepRes = await fetch("/api/vault/prepare-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: currentAccount.address,
          amountAlgo: amount,
        }),
      });
      const prep = await prepRes.json();
      if (prep.error) throw new Error(prep.error);

      const bytes = Uint8Array.from(atob(prep.unsignedTxn), (c) =>
        c.charCodeAt(0),
      );
      const signed = (await signTransactions([bytes]))[0];
      if (!signed) throw new Error("Wallet returned empty signature");

      const b64 = btoa(String.fromCharCode(...Array.from(signed)));
      const submitRes = await fetch("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: b64 }),
      });
      const submit = await submitRes.json();
      if (submit.error) throw new Error(submit.error);

      const creditRes = await fetch("/api/vault/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: currentAccount.address,
          txId: submit.txId,
        }),
      });
      const credit = await creditRes.json();
      if (credit.error) throw new Error(credit.error);

      setVault(credit.account ?? null);
      sysAction(
        `Vault funded: **${credit.amountAlgo} ALGO** (TX: \`${submit.txId}\`)`,
        "transaction",
      );
    } catch (e) {
      sysAction(
        `**Vault Funding Error:** ${e instanceof Error ? e.message : "Failed"}`,
        "result",
      );
    } finally {
      setFunding(false);
    }
  }

  async function saveVaultPolicy(): Promise<void> {
    if (!currentAccount?.address || policySaving) return;

    setPolicySaving(true);
    try {
      const sellers = allowedSellersText
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const services = allowedServicesText
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      const r = await fetch("/api/vault/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: currentAccount.address,
          policy: {
            maxPerOrderAlgo: Number(maxPerOrder),
            dailyCapAlgo: Number(dailyCap),
            allowedSellers: sellers,
            allowedServices: services,
            expiresAt: expiresAt
              ? new Date(expiresAt).toISOString()
              : undefined,
          },
        }),
      });

      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setVault(d.account ?? null);
      sysAction("Vault policy updated.", "transaction");
    } catch (e) {
      sysAction(
        `**Vault Policy Error:** ${e instanceof Error ? e.message : "Failed"}`,
        "result",
      );
    } finally {
      setPolicySaving(false);
    }
  }

  const canConfirm =
    state.selectedDeal &&
    state.escrow.status === "idle" &&
    state.phase === "completed";
  const phase = PHASE_LABEL[state.phase] ?? PHASE_LABEL.idle;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* ─── Chat main ─── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Phase strip */}
        {state.phase !== "idle" && (
          <div
            style={{
              padding: "6px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              flexShrink: 0,
            }}
          >
            <span
              className="anim-blink"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: phase.color,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                color: phase.color,
                fontFamily: "var(--mono)",
                fontWeight: 500,
              }}
            >
              {phase.text}
            </span>
          </div>
        )}

        <ChatInterface actions={state.actions} />

        {/* Confirm bar */}
        {canConfirm && (
          <div
            className="anim-fade-up"
            style={{
              borderTop: "1px solid var(--border)",
              padding: "12px 20px",
              background: "var(--bg-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "0.8375rem",
                  fontWeight: 600,
                  color: "var(--text-1)",
                  marginBottom: 2,
                }}
              >
                Purchase from{" "}
                <span style={{ color: "var(--blue-bright)" }}>
                  {state.selectedDeal!.sellerName}
                </span>
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                {state.selectedDeal!.finalPrice} ALGO —{" "}
                {currentAccount
                  ? "wallet signature required"
                  : "connect wallet to sign"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                className="btn-secondary"
                onClick={() =>
                  setState((p) => ({ ...p, selectedDeal: null, phase: "idle" }))
                }
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <X size={12} /> Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => execDeal(state.selectedDeal!)}
                disabled={!currentAccount}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <CheckCircle size={13} />
                {currentAccount ? "Confirm & Sign" : "Connect Wallet"}
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-surface)",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "10px 16px 14px", display: "flex", gap: 10 }}>
            <input
              className="trae-input"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(msg);
                }
              }}
              placeholder={
                loading
                  ? "Agent is working…"
                  : "Tell the agent what you want to buy…"
              }
              disabled={
                loading || !["idle", "completed", "error"].includes(state.phase)
              }
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={() => submit(msg)}
              disabled={
                loading ||
                !msg.trim() ||
                !["idle", "completed", "error"].includes(state.phase)
              }
              style={{
                flexShrink: 0,
                padding: "0.5rem 1rem",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {loading ? (
                <div
                  className="anim-spin"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.2)",
                    borderTopColor: "#fff",
                  }}
                />
              ) : (
                <Send size={14} />
              )}
              {loading ? "" : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right sidebar ─── */}
      <aside
        style={{
          width: 280,
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Auto-Buy */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={14} color="var(--text-3)" />
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-2)",
                }}
              >
                Auto-Buy
              </span>
            </div>
            <button
              onClick={() => setState((p) => ({ ...p, autoBuy: !p.autoBuy }))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--text-3)",
                fontSize: "0.75rem",
              }}
            >
              {state.autoBuy ? (
                <>
                  <ToggleRight
                    size={20}
                    color="var(--blue-bright)"
                    fill="currentColor"
                  />
                  <span
                    style={{
                      color: "var(--blue-bright)",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                    }}
                  >
                    ON
                  </span>
                </>
              ) : (
                <>
                  <ToggleLeft size={20} />
                  <span>OFF</span>
                </>
              )}
            </button>
          </div>
          <p
            style={{ fontSize: "0.7rem", color: "var(--text-4)", marginTop: 4 }}
          >
            Agent executes automatically from your funded buyer vault
          </p>
        </div>

        <div
          className="scroll"
          style={{
            flex: 1,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {/* Wallet */}
          {currentAccount && (
            <div
              style={{
                background: "rgba(43,127,255,0.06)",
                border: "1px solid var(--blue-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
              }}
            >
              <p
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  color: "var(--blue-bright)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Wallet
              </p>
              <p
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.7rem",
                  color: "var(--text-2)",
                  wordBreak: "break-all",
                  lineHeight: 1.5,
                }}
              >
                {currentAccount.address}
              </p>
            </div>
          )}

          {currentAccount && (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  color: "var(--text-2)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Buyer Vault
              </p>
              <p style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                {vaultLoading
                  ? "Loading vault..."
                  : `Balance: ${vault?.balanceAlgo?.toFixed(6) ?? "0.000000"} ALGO`}
              </p>

              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="trae-input"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Deposit ALGO"
                  style={{ flex: 1, minWidth: 0, fontSize: "0.72rem" }}
                />
                <button
                  className="btn-secondary"
                  onClick={() => fundVault()}
                  disabled={funding || vaultLoading}
                  style={{ padding: "0.35rem 0.55rem", fontSize: "0.72rem" }}
                >
                  {funding ? "Funding..." : "Fund"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <input
                  className="trae-input"
                  value={maxPerOrder}
                  onChange={(e) => setMaxPerOrder(e.target.value)}
                  placeholder="Max/order"
                  style={{ fontSize: "0.72rem" }}
                />
                <input
                  className="trae-input"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  placeholder="Daily cap"
                  style={{ fontSize: "0.72rem" }}
                />
              </div>

              <input
                className="trae-input"
                value={allowedSellersText}
                onChange={(e) => setAllowedSellersText(e.target.value)}
                placeholder="Allow sellers (comma-separated addresses)"
                style={{ fontSize: "0.72rem" }}
              />

              <input
                className="trae-input"
                value={allowedServicesText}
                onChange={(e) => setAllowedServicesText(e.target.value)}
                placeholder="Allow services (comma-separated names)"
                style={{ fontSize: "0.72rem" }}
              />

              <input
                className="trae-input"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{ fontSize: "0.72rem" }}
              />

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn-secondary"
                  onClick={() => saveVaultPolicy()}
                  disabled={policySaving || vaultLoading}
                  style={{ padding: "0.35rem 0.55rem", fontSize: "0.72rem" }}
                >
                  {policySaving ? "Saving..." : "Save Policy"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => refreshVault()}
                  disabled={vaultLoading}
                  style={{ padding: "0.35rem 0.55rem", fontSize: "0.72rem" }}
                >
                  Refresh
                </button>
              </div>
            </div>
          )}

          {/* Discovered listings */}
          {state.listings.length > 0 && (
            <div>
              <p
                className="section-label"
                style={{ paddingInline: 0, marginBottom: 6 }}
              >
                <ArrowRight
                  size={10}
                  style={{ display: "inline", marginRight: 4 }}
                />
                Discovered ({state.listings.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {state.listings.map((l) => {
                  const neg = state.negotiations.find(
                    (n) => n.listingTxId === l.txId,
                  );
                  return (
                    <ListingCard
                      key={l.txId}
                      listing={l}
                      negotiation={neg}
                      isSelected={state.selectedDeal?.listingTxId === l.txId}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <NegotiationTimeline sessions={state.negotiations} />
          <TransactionStatus escrow={state.escrow} />

          {state.actions.length === 0 && (
            <div style={{ textAlign: "center", paddingTop: 32 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 10px",
                }}
              >
                <Zap size={18} color="var(--text-4)" />
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-4)" }}>
                Send a message to start
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
