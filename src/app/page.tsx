"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { WalletConnect } from "@/components/wallet-connect";
import type {
  SessionState,
  AgentAction,
  ParsedIntent,
  OnChainListing,
  NegotiationSession,
  EscrowState,
} from "@/lib/agents/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellForm {
  service:     string;
  type:        string;
  price:       string;
  description: string;
  username:    string;
  password:    string;
  productType: string;
  notes:       string;
}

interface LookerEntry {
  txId: string;
  service: string;
  price: number;
  type: string;
  round: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  { value: "cloud-storage", label: "Cloud Storage" },
  { value: "api-access",    label: "API Access" },
  { value: "compute",       label: "GPU Compute" },
  { value: "hosting",       label: "Hosting" },
  { value: "other",         label: "Other" },
];

const PHASE_MAP: Record<string, { label: string; color: string; dot: string }> = {
  idle:         { label: "IDLE",        color: "text-zinc-500",    dot: "bg-zinc-600" },
  initializing: { label: "INIT",        color: "text-cyan-400",    dot: "bg-cyan-500" },
  parsing:      { label: "PARSING",     color: "text-blue-400",    dot: "bg-blue-500" },
  discovering:  { label: "SCANNING",    color: "text-violet-400",  dot: "bg-violet-500" },
  negotiating:  { label: "NEGOTIATING", color: "text-yellow-400",  dot: "bg-yellow-500" },
  executing:    { label: "EXECUTING",   color: "text-orange-400",  dot: "bg-orange-500" },
  completed:    { label: "COMPLETE",    color: "text-green-400",   dot: "bg-green-500" },
  error:        { label: "ERROR",       color: "text-red-400",     dot: "bg-red-500" },
};

const INTENT_SUGGESTIONS = [
  "Buy cloud storage under 1 ALGO",
  "Find cheapest API gateway",
  "GPU compute for ML training",
  "Managed hosting under 0.8 ALGO",
];

const INITIAL_ESCROW: EscrowState = {
  status: "idle",
  buyerAddress: "",
  sellerAddress: "",
  amount: 0,
  txId: "",
  confirmedRound: 0,
};

const INITIAL_SESSION: SessionState = {
  sessionId: "",
  intent: null,
  listings: [],
  negotiations: [],
  selectedDeal: null,
  escrow: INITIAL_ESCROW,
  actions: [],
  phase: "idle",
  autoBuy: false,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionLine({ action }: { action: AgentAction }) {
  const ts = new Date(action.timestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const colorClass =
    action.agent === "buyer"      ? "text-cyan-400" :
    action.agent === "seller"     ? "text-pink-400" :
    action.agent === "user"       ? "text-green-400" :
    action.type === "transaction" ? "text-yellow-400" :
    action.type === "result"      ? "text-zinc-200" :
    "text-zinc-600";

  // Render URLs inside content as clickable links
  function renderContent(text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, idx) =>
      urlRegex.test(part) ? (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 underline hover:text-cyan-300 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      ) : (
        <span key={idx}>{part}</span>
      ),
    );
  }

  return (
    <div className={`flex gap-2 text-[11px] leading-relaxed font-mono ${colorClass}`}>
      <span className="text-zinc-700 shrink-0">{ts}</span>
      <span className="text-zinc-600 shrink-0">[{action.agentName}]</span>
      <span className="break-all whitespace-pre-wrap">{renderContent(action.content)}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { activeAccount, signTransactions } = useWallet();

  // Hydration guard — wallet state differs between server and client
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const walletReady = mounted && !!activeAccount;

  // Session
  const [session, setSession] = useState<SessionState>(INITIAL_SESSION);
  const [autoBuy, setAutoBuy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Sell
  const [sellForm, setSellForm] = useState<SellForm>({
    service: "", type: "cloud-storage", price: "", description: "",
    username: "", password: "", productType: "cloud-storage", notes: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showCredPassword, setShowCredPassword] = useState(false);

  // Purchased credentials — shown after successful x402 payment
  const [purchasedCreds, setPurchasedCreds] = useState<{
    username: string; password: string; productType?: string; notes?: string; service?: string;
  } | null>(null);
  const [sellStatus, setSellStatus] = useState<{ success: boolean; txId?: string; error?: string } | null>(null);
  const [isSelling, setIsSelling] = useState(false);

  // Marketplace browse
  const [marketFilter, setMarketFilter] = useState("");
  const [browseListings, setBrowseListings] = useState<OnChainListing[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browseFetched, setBrowseFetched] = useState(false);

  // Intent
  const [intentMsg, setIntentMsg] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  // Looker
  const [lookerEntries, setLookerEntries] = useState<LookerEntry[]>([]);
  const [lookerTs, setLookerTs] = useState<Date | null>(null);
  const [reputationBoard, setReputationBoard] = useState<Array<{ address: string; name: string; score: number }>>([
    { address: "CLOUDMAX7INDIA2PQRST4UUVWXY6ZABCDE8FGHIJK0LMNOPQRS3TUVWX", name: "CloudMax India", score: 82 },
    { address: "SECUREHOST5PRO7ABCDE8FGHIJK0LMNOPQRS3TUVWXY6ZABCDE8FGH", name: "SecureHost Pro", score: 67 },
  ]);

  // Vault
  const [vaultAddress, setVaultAddress] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultFundAmt, setVaultFundAmt] = useState("2");
  const [isVaultFunding, setIsVaultFunding] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

  // Active section tracking for nav highlight
  const [activeSection, setActiveSection] = useState("overview");

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const addActions = useCallback((newActions: AgentAction[]) => {
    setSession(prev => ({ ...prev, actions: [...prev.actions, ...newActions] }));
  }, []);

  function mkAction(
    content: string,
    type: AgentAction["type"] = "message",
    agent: AgentAction["agent"] = "system",
  ): AgentAction {
    return {
      id: crypto.randomUUID(),
      agent,
      agentName: agent === "buyer" ? "BUYER_AGENT" : agent === "seller" ? "SELLER_AGENT" : "SYSTEM",
      type,
      content,
      timestamp: new Date().toISOString(),
    };
  }

  async function callApi<T>(
    url: string,
    body: Record<string, unknown>,
    phase: SessionState["phase"],
    timeoutMs = 90_000,
  ): Promise<T | null> {
    setSession(prev => ({ ...prev, phase }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.actions) addActions(data.actions);
      return data as T;
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : "An error occurred";
      addActions([mkAction(`ERROR: ${msg}`, "result")]);
      setSession(prev => ({ ...prev, phase: "error" }));
      return null;
    }
  }

  // Scroll chat to bottom on new actions
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [session.actions.length]);

  // Fetch vault info on mount + poll every 10s
  async function fetchVaultInfo() {
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      if (data.address) setVaultAddress(data.address);
      if (data.balance !== undefined) setVaultBalance(data.balance);
    } catch { /* vault optional */ }
  }
  useEffect(() => {
    fetchVaultInfo();
    const iv = setInterval(fetchVaultInfo, 10_000);
    return () => clearInterval(iv);
  }, []);

  // Looker polling every 15s
  useEffect(() => {
    fetchLookerData();
    const id = setInterval(fetchLookerData, 15_000);
    return () => clearInterval(id);
  }, []);

  async function fetchLookerData() {
    try {
      const res = await fetch("/api/listings/fetch");
      const data = await res.json();
      if (Array.isArray(data.listings) && data.listings.length > 0) {
        const fresh = data.listings
          .sort((a: OnChainListing, b: OnChainListing) => b.round - a.round)
          .slice(0, 25)
          .map((l: OnChainListing) => ({
            txId: l.txId, service: l.service, price: l.price, type: l.type, round: l.round,
          }));
        setLookerEntries(fresh);
        setLookerTs(new Date());
      }
    } catch {
      // ignore; looker is best-effort
    }
  }

  // Update reputation board from negotiations
  useEffect(() => {
    if (session.negotiations.length > 0) {
      const board = session.negotiations
        .filter(n => (n as NegotiationSession & { reputationScore?: number }).reputationScore !== undefined)
        .map(n => {
          // If sellerName looks like an Algorand address, use the service name instead
          const isAddr = n.sellerName.length >= 58 && /^[A-Z2-7]+$/.test(n.sellerName);
          return {
            address: n.sellerAddress,
            name: isAddr ? n.service : n.sellerName,
            score: (n as NegotiationSession & { reputationScore?: number }).reputationScore ?? 0,
          };
        })
        .sort((a, b) => b.score - a.score);
      if (board.length > 0) {
        // Merge with existing mock entries (keep mocks that aren't duplicated)
        setReputationBoard(prev => {
          const newAddrs = new Set(board.map(b => b.address));
          const kept = prev.filter(p => !newAddrs.has(p.address));
          return [...board, ...kept].sort((a, b) => b.score - a.score);
        });
      }
    }
  }, [session.negotiations]);

  // Intersection observer for section nav highlight
  useEffect(() => {
    const sections = ["overview", "sell", "marketplace", "looker"];
    const observers = sections.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { threshold: 0.3 },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  // ── Browse listings ──────────────────────────────────────────────────────────

  async function fetchBrowseListings() {
    setIsBrowsing(true);
    try {
      const params = new URLSearchParams();
      if (marketFilter) params.set("type", marketFilter);
      const res = await fetch(`/api/listings/fetch?${params}`);
      const data = await res.json();
      const fresh = (data.listings ?? []).sort((a: OnChainListing, b: OnChainListing) => b.round - a.round);
      // Only update if we got more results than what we already have (never clear existing)
      setBrowseListings(prev => fresh.length >= prev.length ? fresh : prev);
      setBrowseFetched(true);
    } catch {
      // keep whatever we already have
    }
    setIsBrowsing(false);
  }

  // Fetch on mount; also re-fetch after wallet connects (to pick up any user-posted listings)
  useEffect(() => { fetchBrowseListings(); }, []);
  useEffect(() => {
    if (activeAccount?.address) fetchBrowseListings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.address]);

  // ── Commerce pipeline ────────────────────────────────────────────────────────

  async function handleSubmit(message: string, forceAutoBuy?: boolean) {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    const currentAutoBuy = forceAutoBuy ?? autoBuy;
    setIsLoading(true);
    setSession({
      ...INITIAL_SESSION,
      autoBuy: currentAutoBuy,
      sessionId: crypto.randomUUID(),
      actions: [mkAction(`> ${trimmed}`, "message", "user")],
    });
    setIntentMsg("");

    if (!isInitialized) {
      addActions([mkAction("Initializing A2A system on Algorand TestNet...", "thinking")]);
      const init = await callApi<{ success: boolean }>("/api/init", {}, "initializing");
      if (!init?.success) { setIsLoading(false); return; }
      setIsInitialized(true);
      await new Promise(r => setTimeout(r, 2000));
    }

    addActions([mkAction("Parsing purchase intent with AI...", "thinking")]);
    const intentResult = await callApi<{ intent: ParsedIntent }>("/api/intent", { message: trimmed }, "parsing");
    if (!intentResult?.intent) { setIsLoading(false); return; }
    setSession(prev => ({ ...prev, intent: intentResult.intent }));

    addActions([mkAction("Scanning Algorand Indexer for matching listings...", "thinking")]);
    const discoverResult = await callApi<{ listings: OnChainListing[] }>(
      "/api/discover", { intent: intentResult.intent }, "discovering",
    );
    if (!discoverResult?.listings?.length) {
      addActions([mkAction("No matching on-chain listings found.", "result")]);
      setSession(prev => ({ ...prev, phase: "completed" }));
      setIsLoading(false);
      return;
    }
    setSession(prev => ({ ...prev, listings: discoverResult.listings }));

    addActions([mkAction(`Found ${discoverResult.listings.length} listings. Launching multi-agent negotiation...`, "thinking")]);
    const negotiateResult = await callApi<{ sessions: NegotiationSession[]; bestDeal: NegotiationSession | null }>(
      "/api/negotiate", { intent: intentResult.intent, listings: discoverResult.listings }, "negotiating",
    );
    if (!negotiateResult) { setIsLoading(false); return; }
    setSession(prev => ({ ...prev, negotiations: negotiateResult.sessions, selectedDeal: negotiateResult.bestDeal }));

    if (!negotiateResult.bestDeal) {
      addActions([mkAction("No acceptable deal reached.", "result")]);
      setSession(prev => ({ ...prev, phase: "completed" }));
      setIsLoading(false);
      return;
    }

    const deal = negotiateResult.bestDeal;
    if (currentAutoBuy) {
      await executeTransaction(deal);
    } else {
      const rep = (deal as NegotiationSession & { reputationScore?: number }).reputationScore;
      addActions([mkAction(
        `DEAL FOUND: ${deal.finalPrice} ALGO for "${deal.service}" from ${deal.sellerName}` +
        (rep !== undefined ? ` [reputation: ${rep}/100]` : "") +
        `\nClick CONFIRM PAYMENT to execute on-chain.`,
        "result",
        "buyer",
      )]);
      setSession(prev => ({ ...prev, phase: "completed" }));
    }
    setIsLoading(false);
  }

  async function executeTransaction(deal: NegotiationSession) {
    setIsLoading(true);
    setSession(prev => ({ ...prev, phase: "executing" }));
    // Prefer vault (auto-sign) > wallet > server-side
    if (vaultBalance >= deal.finalPrice + 0.01) {
      await executeWithVault(deal);
    } else if (activeAccount) {
      await executeWithWallet(deal);
    } else {
      await executeServerSide(deal);
    }
    setSession(prev => ({ ...prev, phase: "completed" }));
    setIsLoading(false);
    // Refresh vault balance
    fetchVaultInfo();
  }

  // ── Vault auto-sign execution ───────────────────────────────────────────

  async function executeWithVault(deal: NegotiationSession) {
    try {
      addActions([mkAction(`⬡ VAULT AUTO-SIGN: Paying ${deal.finalPrice} ALGO from vault...`, "transaction")]);

      const payRes = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          receiverAddress: deal.sellerAddress,
          amountAlgo: deal.finalPrice,
          note: `A2A Vault | ${deal.service} | ${deal.finalPrice} ALGO`,
        }),
      });
      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) throw new Error(payData.error ?? "Vault payment failed");

      setSession(prev => ({
        ...prev,
        escrow: {
          status: "released",
          buyerAddress: vaultAddress,
          sellerAddress: deal.sellerAddress,
          amount: deal.finalPrice,
          txId: payData.txId,
          confirmedRound: payData.confirmedRound,
        },
      }));

      addActions([mkAction(
        `PAYMENT CONFIRMED (vault auto-sign)\nTX: ${payData.txId}\nRound: ${payData.confirmedRound}\nAmount: ${deal.finalPrice} ALGO\nVault balance: ${payData.vaultBalance?.toFixed(4) ?? "?"} ALGO\nhttps://lora.algokit.io/testnet/transaction/${payData.txId}`,
        "transaction",
      )]);

      setVaultBalance(payData.vaultBalance ?? 0);

      // Fetch credentials via x402
      if (deal.listingTxId) {
        try {
          const credRes = await fetch(`/api/products/${deal.listingTxId}?proof=${payData.txId}&amount=${deal.finalPrice}`);
          const credData = await credRes.json();
          if (credRes.ok && credData.credentials) {
            setPurchasedCreds({
              username:    credData.credentials.username,
              password:    credData.credentials.password,
              productType: credData.credentials.productType,
              notes:       credData.credentials.notes,
              service:     credData.service ?? deal.service,
            });
            addActions([mkAction(
              `🔐 CREDENTIALS DELIVERED via x402 protocol\nService: ${credData.service ?? deal.service}`,
              "result",
            )]);
          } else if (credRes.status !== 404) {
            addActions([mkAction(`⚠ Credential delivery: ${credData.error ?? "failed"}`, "result")]);
          }
        } catch {
          // best-effort
        }
      }

      // Auto-sign reputation update via vault
      try {
        const repRes = await fetch("/api/reputation/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: vaultAddress,
            agentAddress: deal.sellerAddress,
            action: "increment",
            magnitude: "standard",
            reason: `Vault auto-payment for ${deal.service}`,
          }),
        });
        const repData = await repRes.json();
        if (repRes.ok && repData.unsignedTxn) {
          const signRes = await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sign", unsignedTxn: repData.unsignedTxn }),
          });
          const signData = await signRes.json();
          if (signData.txId) {
            addActions([mkAction(
              `⬡ REPUTATION UPDATED (vault auto-sign)\nScore: +85\nTX: ${signData.txId}`,
              "transaction",
            )]);
            setReputationBoard(prev => {
              const isAddr = deal.sellerName.length >= 58 && /^[A-Z2-7]+$/.test(deal.sellerName);
              const displayName = isAddr ? deal.service : deal.sellerName;
              const existing = prev.find(p => p.address === deal.sellerAddress);
              if (existing) {
                return prev.map(p =>
                  p.address === deal.sellerAddress ? { ...p, score: Math.min(100, p.score + 8) } : p
                ).sort((a, b) => b.score - a.score);
              }
              return [...prev, { address: deal.sellerAddress, name: displayName, score: 85 }]
                .sort((a, b) => b.score - a.score);
            });
          }
        }
      } catch {
        // best-effort
      }
    } catch (err) {
      addActions([mkAction(`VAULT ERROR: ${err instanceof Error ? err.message : "unknown"}`, "result")]);
    }
  }

  async function executeWithWallet(deal: NegotiationSession) {
    try {
      addActions([mkAction(`Preparing ${deal.finalPrice} ALGO payment — awaiting wallet signature...`, "transaction")]);
      const prepRes = await fetch("/api/wallet/prepare-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: activeAccount!.address,
          receiverAddress: deal.sellerAddress,
          amountAlgo: deal.finalPrice,
          note: `A2A Commerce | ${deal.service} | ${deal.finalPrice} ALGO`,
        }),
      });
      const prepData = await prepRes.json();
      if (prepData.error) throw new Error(prepData.error);

      const txnBytes = Uint8Array.from(atob(prepData.unsignedTxn), c => c.charCodeAt(0));
      const signedTxns = await signTransactions([txnBytes]);
      const signed = signedTxns[0];
      if (!signed) throw new Error("Wallet returned empty signature");
      const signedB64 = btoa(String.fromCharCode(...Array.from(signed)));

      addActions([mkAction("Transaction signed. Broadcasting to Algorand TestNet...", "transaction")]);
      const submitRes = await fetch("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });
      const submitData = await submitRes.json();
      if (submitData.error) throw new Error(submitData.error);

      setSession(prev => ({
        ...prev,
        escrow: {
          status: "released",
          buyerAddress: activeAccount!.address,
          sellerAddress: deal.sellerAddress,
          amount: deal.finalPrice,
          txId: submitData.txId,
          confirmedRound: submitData.confirmedRound,
        },
      }));

      addActions([mkAction(
        `PAYMENT CONFIRMED\nTX: ${submitData.txId}\nRound: ${submitData.confirmedRound}\nAmount: ${deal.finalPrice} ALGO\nhttps://lora.algokit.io/testnet/transaction/${submitData.txId}`,
        "transaction",
      )]);

      // ── Fetch credentials via x402 proof (same as server-side flow) ──
      if (deal.listingTxId) {
        try {
          const credRes = await fetch(`/api/products/${deal.listingTxId}?proof=${submitData.txId}&amount=${deal.finalPrice}`);
          const credData = await credRes.json();
          if (credRes.ok && credData.credentials) {
            setPurchasedCreds({
              username:    credData.credentials.username,
              password:    credData.credentials.password,
              productType: credData.credentials.productType,
              notes:       credData.credentials.notes,
              service:     credData.service ?? deal.service,
            });
            addActions([mkAction(
              `🔐 CREDENTIALS DELIVERED via x402 protocol\nService: ${credData.service ?? deal.service}\nPayment proof verified on-chain (round ${submitData.confirmedRound})`,
              "result",
            )]);
          } else if (credRes.status === 404) {
            addActions([mkAction("ℹ No credentials stored for this listing. Payment completed successfully.", "result")]);
          } else {
            addActions([mkAction(`⚠ Credential delivery: ${credData.error ?? "failed"}. Payment TX confirmed.`, "result")]);
          }
        } catch {
          addActions([mkAction("⚠ Could not fetch credentials. Payment TX confirmed on-chain.", "result")]);
        }
      }

      // ── Update seller reputation on-chain via Reputation contract ──
      try {
        const repRes = await fetch("/api/reputation/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: activeAccount!.address,
            agentAddress: deal.sellerAddress,
            action: "increment",
            magnitude: "standard",
            reason: `A2A Commerce payment for ${deal.service}`,
          }),
        });
        const repData = await repRes.json();
        if (repRes.ok && repData.unsignedTxn) {
          const repTxnBytes = Uint8Array.from(atob(repData.unsignedTxn), c => c.charCodeAt(0));
          const signedRepTxns = await signTransactions([repTxnBytes]);
          const signedRep = signedRepTxns[0];
          if (signedRep) {
            const signedRepB64 = btoa(String.fromCharCode(...Array.from(signedRep)));
            const repSubmit = await fetch("/api/wallet/submit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ signedTxn: signedRepB64 }),
            });
            const repSubmitData = await repSubmit.json();
            if (repSubmitData.txId) {
              addActions([mkAction(
                `⬡ REPUTATION UPDATED on-chain via AgentReputation contract\nScore: +85 (standard increment)\nTX: ${repSubmitData.txId}`,
                "transaction",
              )]);
              // Bump score in local leaderboard
              setReputationBoard(prev => {
                const isAddr = deal.sellerName.length >= 58 && /^[A-Z2-7]+$/.test(deal.sellerName);
                const displayName = isAddr ? deal.service : deal.sellerName;
                const existing = prev.find(p => p.address === deal.sellerAddress);
                if (existing) {
                  return prev.map(p =>
                    p.address === deal.sellerAddress
                      ? { ...p, score: Math.min(100, p.score + 8) }
                      : p
                  ).sort((a, b) => b.score - a.score);
                }
                return [...prev, { address: deal.sellerAddress, name: displayName, score: 85 }]
                  .sort((a, b) => b.score - a.score);
              });
            }
          }
        }
      } catch {
        // Best-effort reputation update
      }
    } catch (err) {
      addActions([mkAction(`WALLET ERROR: ${err instanceof Error ? err.message : "unknown"}`, "result")]);
    }
  }

  async function executeServerSide(deal: NegotiationSession) {
    const result = await callApi<{
      success: boolean;
      escrow?: EscrowState;
      paymentTxId?: string;
      credentials?: { username: string; password: string; productType?: string; notes?: string };
    }>("/api/execute", { deal }, "executing");

    if (result?.escrow) {
      setSession(prev => ({ ...prev, escrow: result.escrow! }));
    } else if (result?.paymentTxId) {
      setSession(prev => ({
        ...prev,
        escrow: { ...prev.escrow, status: "released", txId: result.paymentTxId! },
      }));
    }

    if (result?.credentials) {
      const creds = result.credentials;
      setPurchasedCreds({
        username:    creds.username,
        password:    creds.password,
        productType: creds.productType,
        notes:       creds.notes,
        service:     deal.service,
      });
    }
  }

  // ── Sell ─────────────────────────────────────────────────────────────────────

  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAccount || !sellForm.service || !sellForm.price || !sellForm.username || !sellForm.password) return;
    setIsSelling(true);
    setSellStatus(null);
    try {
      const createRes = await fetch("/api/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: activeAccount.address,
          service:       sellForm.service,
          type:          sellForm.type,
          price:         parseFloat(sellForm.price),
          description:   sellForm.description || `${sellForm.service} via A2A Commerce`,
          username:      sellForm.username,
          password:      sellForm.password,
          productType:   sellForm.productType || sellForm.type,
          notes:         sellForm.notes,
        }),
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error);

      const txnBytes = Uint8Array.from(atob(createData.unsignedTxn), c => c.charCodeAt(0));
      const signedTxns = await signTransactions([txnBytes]);
      const signed = signedTxns[0];
      if (!signed) throw new Error("Wallet returned empty signature");
      const signedB64 = btoa(String.fromCharCode(...Array.from(signed)));

      const submitRes = await fetch("/api/wallet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTxn: signedB64 }),
      });
      const submitData = await submitRes.json();
      if (submitData.error) throw new Error(submitData.error);

      setSellStatus({ success: true, txId: submitData.txId });
      setSellForm({ service: "", type: "cloud-storage", price: "", description: "", username: "", password: "", productType: "cloud-storage", notes: "" });
    } catch (err) {
      setSellStatus({ success: false, error: err instanceof Error ? err.message : "Listing failed" });
    }
    setIsSelling(false);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const phaseConfig = PHASE_MAP[session.phase] ?? PHASE_MAP.idle;
  const isActive = !["idle", "completed", "error"].includes(session.phase);
  const hasConfirmable = session.selectedDeal && session.escrow.status === "idle" && session.phase === "completed";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg)] relative">
      {/* ─── SCANLINE is on body via className="scanlines" ─── */}

      {/* ═══════════════════════════════════════════════════════ NAV ══════════ */}
      <nav className="fixed top-0 inset-x-0 z-50 glass border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <a href="#overview" className="flex items-center gap-2.5 shrink-0 group">
            <div
              className="w-8 h-8 border border-cyan-500/60 flex items-center justify-center transition-all group-hover:border-cyan-400"
              style={{
                clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                boxShadow: "0 0 10px rgba(0,229,255,0.2)",
              }}
            >
              <span className="font-orbitron text-[8px] font-black text-cyan-400">A2A</span>
            </div>
            <span className="font-orbitron font-bold text-sm tracking-[0.2em] text-white hidden sm:block">
              A2A<span className="text-cyan-400">.</span>COMMERCE
            </span>
          </a>

          {/* Nav links */}
          <div className="flex items-center">
            {(["OVERVIEW", "SELL", "VAULT", "MARKETPLACE", "LOOKER"] as const).map(sec => {
              const isActive = activeSection === sec.toLowerCase();
              return (
                <a
                  key={sec}
                  href={`#${sec.toLowerCase()}`}
                  className={`px-3 py-5 text-[10px] font-orbitron tracking-[0.15em] border-b-2 transition-all ${
                    isActive
                      ? "text-cyan-400 border-cyan-400"
                      : "text-zinc-600 border-transparent hover:text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {sec}
                </a>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 border border-[var(--border)] text-[10px] font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${phaseConfig.dot} ${isActive ? "animate-pulse" : ""}`} />
              <span className={phaseConfig.color}>{phaseConfig.label}</span>
            </div>
            <button
              onClick={() => setAutoBuy(p => !p)}
              className={`hidden md:block px-2.5 py-1 text-[10px] font-mono border rounded transition-all ${
                autoBuy
                  ? "text-green-400 border-green-500/30 bg-green-500/5"
                  : "text-zinc-700 border-zinc-800 hover:text-zinc-400"
              }`}
            >
              AUTO {autoBuy ? "ON" : "OFF"}
            </button>
            <WalletConnect />
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════ OVERVIEW ═════════ */}
      <section id="overview" className="min-h-screen pt-14 flex flex-col justify-center relative overflow-hidden grid-bg">

        {/* Corner brackets */}
        <div className="absolute top-20 left-6 w-10 h-10 border-l-2 border-t-2 border-cyan-500/25 pointer-events-none" />
        <div className="absolute top-20 right-6 w-10 h-10 border-r-2 border-t-2 border-cyan-500/25 pointer-events-none" />
        <div className="absolute bottom-10 left-6 w-10 h-10 border-l-2 border-b-2 border-cyan-500/25 pointer-events-none" />
        <div className="absolute bottom-10 right-6 w-10 h-10 border-r-2 border-b-2 border-cyan-500/25 pointer-events-none" />

        {/* Centre fade line */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="section-label mb-6 animate-fade-in">
            ALGORAND TESTNET // PROTOCOL v1.0 // PUYA SMART CONTRACTS
          </div>

          {/* Hero heading */}
          <div className="mb-8 animate-fade-in-up">
            <h1
              className="font-orbitron font-black leading-none tracking-tight animate-glitch"
              style={{ fontSize: "clamp(2.5rem, 10vw, 6rem)" }}
            >
              <span style={{ color: "var(--cyan)", textShadow: "0 0 60px rgba(0,229,255,0.25)" }}>A2A</span>
              <br />
              <span className="text-white" style={{ fontSize: "clamp(1.5rem, 6vw, 3.5rem)", letterSpacing: "0.3em" }}>
                AGENTIC
              </span>
              <br />
              <span style={{ color: "var(--magenta)", textShadow: "0 0 40px rgba(240,0,255,0.2)", fontSize: "clamp(2rem, 8vw, 5rem)" }}>
                COMMERCE
              </span>
            </h1>
          </div>

          <p className="text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-mono text-sm sm:text-base animate-fade-in">
            Autonomous AI agents discover, negotiate, and transact on{" "}
            <span className="text-cyan-400 font-bold">Algorand</span>.{" "}
            On-chain ZK verification · x402 payment protocol · Real ALGO settlements.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-16 animate-fade-in">
            <a
              href="#marketplace"
              className="btn-solid-cyan px-8 py-3 text-xs font-orbitron tracking-[0.15em] rounded"
            >
              INITIATE COMMERCE
            </a>
            <a
              href="#sell"
              className="btn-cyan px-8 py-3 text-xs font-orbitron tracking-[0.15em] rounded"
            >
              POST LISTING
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
            {[
              { label: "REPUTATION APP",  value: "757478982",  sub: "On-chain Contract",  color: "text-cyan-400" },
              { label: "NETWORK",         value: "TESTNET",     sub: "Algorand",           color: "text-green-400" },
              { label: "PAYMENT LAYER",   value: "x402",        sub: "HTTP Protocol",      color: "text-pink-400" },
              { label: "FINALITY",        value: "~3.9s",       sub: "Pure PoS",           color: "text-yellow-400" },
            ].map(stat => (
              <div key={stat.label} className="neon-card rounded-xl p-4 text-left">
                <div className="section-label mb-2">{stat.label}</div>
                <div className={`font-orbitron font-bold text-lg ${stat.color}`}>{stat.value}</div>
                <div className="text-zinc-700 text-[10px] mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: "⬡", title: "ON-CHAIN ZK",    desc: "Zero-knowledge commitments stored on Algorand" },
              { icon: "◈", title: "AI NEGOTIATION", desc: "Multi-round agent bargaining powered by Groq" },
              { icon: "▣", title: "REPUTATION",     desc: "BoxMap-based on-chain seller scoring system" },
              { icon: "◆", title: "x402 PROTOCOL",  desc: "HTTP 402 automated ALGO payment settlements" },
            ].map(feat => (
              <div key={feat.title} className="neon-card rounded-xl p-4 text-left group">
                <div className="text-xl mb-3 text-cyan-500/40 group-hover:text-cyan-400 transition-colors duration-300">
                  {feat.icon}
                </div>
                <div className="font-orbitron font-bold text-[10px] tracking-widest text-zinc-300 mb-1.5">
                  {feat.title}
                </div>
                <div className="text-zinc-600 text-[10px] leading-relaxed">{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-pulse pointer-events-none">
          <div className="section-label text-[8px] opacity-50">SCROLL</div>
          <div className="w-px h-8 bg-gradient-to-b from-cyan-500/40 to-transparent" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ SELL ═════════ */}
      <section id="sell" className="min-h-screen pt-14 flex items-center">
        <div className="max-w-2xl mx-auto w-full px-6 py-16">

          <div className="section-label mb-2">SELL // BROADCAST ON-CHAIN</div>
          <h2 className="font-orbitron font-bold text-white mb-2" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            List Your <span style={{ color: "var(--magenta)" }}>Service</span>
          </h2>
          <p className="text-zinc-600 text-sm mb-10 font-mono">
            Post to the Algorand Indexer. AI buyer agents will discover and negotiate automatically.
          </p>

          {!walletReady ? (
            <div className="neon-card rounded-2xl p-10 text-center">
              <div
                className="w-16 h-16 mx-auto mb-5 border border-pink-500/30 rounded-full flex items-center justify-center text-3xl opacity-40"
                style={{ boxShadow: "var(--glow-mag)" }}
              >
                ◈
              </div>
              <p className="font-orbitron text-sm text-zinc-400 mb-1 tracking-widest">WALLET REQUIRED</p>
              <p className="text-zinc-600 text-xs mb-6 font-mono">Connect your Algorand wallet to sign and broadcast a listing.</p>
              <WalletConnect />
            </div>
          ) : (
            <form onSubmit={handleSell} className="neon-card rounded-2xl p-6 space-y-5">
              {/* Seller tag */}
              <div className="flex items-center gap-2 pb-4 border-b border-[var(--border)]">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] font-mono text-zinc-600">
                  {activeAccount.address.slice(0, 20)}...{activeAccount.address.slice(-8)}
                </span>
                <span className="badge-green ml-auto">CONNECTED</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="section-label">SERVICE NAME *</label>
                  <input
                    type="text"
                    value={sellForm.service}
                    onChange={e => setSellForm(p => ({ ...p, service: e.target.value }))}
                    placeholder="e.g., Premium Cloud Storage 100GB"
                    required
                    className="input-cp w-full rounded-lg px-4 py-2.5 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="section-label">SERVICE TYPE *</label>
                  <select
                    value={sellForm.type}
                    onChange={e => setSellForm(p => ({ ...p, type: e.target.value }))}
                    className="input-cp w-full rounded-lg px-4 py-2.5 text-sm font-mono"
                  >
                    {SERVICE_TYPES.map(t => (
                      <option key={t.value} value={t.value} className="bg-[#0b0b1a]">{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="section-label">PRICE (ALGO) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={sellForm.price}
                    onChange={e => setSellForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.500"
                    required
                    className="input-cp w-full rounded-lg px-4 py-2.5 text-sm font-mono"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="section-label">DESCRIPTION</label>
                  <textarea
                    value={sellForm.description}
                    onChange={e => setSellForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Describe specs, SLA, features..."
                    rows={3}
                    className="input-cp w-full rounded-lg px-4 py-2.5 text-sm font-mono resize-none"
                  />
                </div>

                {/* ── Credentials Section ── */}
                <div className="sm:col-span-2">
                  <div className="border border-cyan-500/20 rounded-xl p-4 space-y-3 bg-cyan-500/3">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 text-xs font-orbitron tracking-widest">🔐 PRODUCT CREDENTIALS</span>
                      <span className="text-[10px] text-zinc-500 font-mono">delivered to buyer after x402 payment</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="section-label">USERNAME / EMAIL *</label>
                        <input
                          type="text"
                          value={sellForm.username}
                          onChange={e => setSellForm(p => ({ ...p, username: e.target.value }))}
                          placeholder="user@service.com"
                          required
                          className="input-cp w-full rounded-lg px-4 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="section-label flex items-center justify-between">
                          PASSWORD *
                          <button type="button" onClick={() => setShowPassword(p => !p)} className="text-zinc-500 hover:text-cyan-400 text-[10px] font-mono">
                            {showPassword ? "HIDE" : "SHOW"}
                          </button>
                        </label>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={sellForm.password}
                          onChange={e => setSellForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="••••••••••••"
                          required
                          className="input-cp w-full rounded-lg px-4 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="section-label">ADDITIONAL NOTES (OPTIONAL)</label>
                      <input
                        type="text"
                        value={sellForm.notes}
                        onChange={e => setSellForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="e.g. Login at https://app.service.com | Plan: Pro | Region: IN"
                        className="input-cp w-full rounded-lg px-4 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSelling || !sellForm.service || !sellForm.price || !sellForm.username || !sellForm.password}
                  className="btn-solid-cyan px-8 py-2.5 text-xs font-orbitron tracking-[0.15em] rounded-lg flex items-center gap-2"
                >
                  {isSelling ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      SIGNING...
                    </>
                  ) : "SIGN & BROADCAST"}
                </button>
              </div>

              {sellStatus && (
                <div
                  className={`rounded-xl p-4 border font-mono text-sm animate-fade-in ${
                    sellStatus.success
                      ? "bg-green-500/5 border-green-500/20 text-green-400"
                      : "bg-red-500/5 border-red-500/20 text-red-400"
                  }`}
                >
                  {sellStatus.success ? (
                    <>
                      <div className="font-bold mb-1 font-orbitron text-xs tracking-widest">✓ LISTING BROADCAST</div>
                      <div className="text-[11px] opacity-80">
                        TX: {sellStatus.txId?.slice(0, 24)}...{" "}
                        <a
                          href={`https://lora.algokit.io/testnet/transaction/${sellStatus.txId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 underline hover:text-cyan-300"
                        >
                          View on Explorer →
                        </a>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold mb-1 font-orbitron text-xs tracking-widest">✗ BROADCAST FAILED</div>
                      <div className="text-[11px] opacity-80">{sellStatus.error}</div>
                    </>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="neon-divider my-10" />
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "FORMAT",     value: "JSON/ARC" },
              { label: "INDEXER",   value: "TESTNET" },
              { label: "BASE FEE",  value: "~0.001 ALGO" },
            ].map(item => (
              <div key={item.label}>
                <div className="section-label mb-1">{item.label}</div>
                <div className="text-cyan-400 font-orbitron text-sm font-bold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════ VAULT ════════════════ */}
      <section id="vault" className="pt-14">
        <div className="max-w-2xl mx-auto w-full px-6 py-16">
          <div className="section-label mb-2">VAULT // AI AGENT AUTO-SIGN WALLET</div>
          <h2 className="font-orbitron font-bold text-white mb-2" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            Agent <span style={{ color: "var(--cyan)" }}>Vault</span>
          </h2>
          <p className="text-zinc-600 text-sm mb-8 font-mono">
            Fund this wallet and AI agents will auto-sign payments &amp; reputation updates — zero popups.
          </p>

          <div className="neon-card rounded-2xl p-6 space-y-5">
            {/* Vault address */}
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}>
                ⬡
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] text-zinc-600 font-mono mb-0.5">VAULT ADDRESS</div>
                {vaultAddress ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://lora.algokit.io/testnet/account/${vaultAddress}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-cyan-500 hover:text-cyan-300 font-mono transition-colors underline break-all"
                    >
                      {vaultAddress.slice(0, 12)}...{vaultAddress.slice(-8)}
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(vaultAddress)}
                      className="text-[9px] text-zinc-600 hover:text-cyan-400 font-mono shrink-0 transition-colors"
                    >
                      COPY
                    </button>
                  </div>
                ) : (
                  <span className="text-zinc-700 text-xs font-mono">Not configured</span>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-orbitron font-bold text-xl" style={{ color: vaultBalance > 0.1 ? "var(--green)" : "var(--red)" }}>
                  {vaultBalance.toFixed(4)}
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">ALGO</div>
              </div>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${vaultBalance > 0.1 ? "bg-green-500 animate-pulse" : "bg-zinc-700"}`} />
              <span className={`text-[10px] font-mono ${vaultBalance > 0.1 ? "text-green-400" : "text-zinc-600"}`}>
                {vaultBalance > 0.1 ? "VAULT ACTIVE — agents will auto-sign" : "VAULT EMPTY — fund to enable auto-sign"}
              </span>
            </div>

            {/* Fund vault */}
            {walletReady ? (
              <div className="space-y-3">
                <div className="section-label">FUND VAULT FROM WALLET</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={vaultFundAmt}
                    onChange={e => setVaultFundAmt(e.target.value)}
                    className="input-cp flex-1 rounded-lg px-4 py-2.5 text-sm font-mono"
                    placeholder="Amount (ALGO)"
                  />
                  <button
                    onClick={async () => {
                      if (!activeAccount || isVaultFunding) return;
                      setIsVaultFunding(true);
                      setVaultStatus(null);
                      try {
                        const fundRes = await fetch("/api/vault", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "fund",
                            senderAddress: activeAccount.address,
                            amountAlgo: parseFloat(vaultFundAmt),
                          }),
                        });
                        const fundData = await fundRes.json();
                        if (fundData.error) throw new Error(fundData.error);

                        const txnBytes = Uint8Array.from(atob(fundData.unsignedTxn), c => c.charCodeAt(0));
                        const signedTxns = await signTransactions([txnBytes]);
                        const signed = signedTxns[0];
                        if (!signed) throw new Error("Wallet returned empty signature");
                        const signedB64 = btoa(String.fromCharCode(...Array.from(signed)));

                        const submitRes = await fetch("/api/wallet/submit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ signedTxn: signedB64 }),
                        });
                        const submitData = await submitRes.json();
                        if (submitData.error) throw new Error(submitData.error);

                        setVaultStatus(`✓ Funded ${vaultFundAmt} ALGO — TX: ${submitData.txId.slice(0, 16)}...`);
                        await fetchVaultInfo();
                      } catch (err) {
                        setVaultStatus(`✗ ${err instanceof Error ? err.message : "Funding failed"}`);
                      }
                      setIsVaultFunding(false);
                    }}
                    disabled={isVaultFunding || !vaultFundAmt || parseFloat(vaultFundAmt) < 0.1}
                    className="btn-solid-cyan px-6 py-2.5 text-xs font-orbitron tracking-widest rounded-lg disabled:opacity-40"
                  >
                    {isVaultFunding ? "SIGNING..." : "FUND VAULT"}
                  </button>
                </div>
                {vaultStatus && (
                  <div className={`text-[10px] font-mono ${
                    vaultStatus.startsWith("✓") ? "text-green-400" : "text-red-400"
                  }`}>
                    {vaultStatus}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-zinc-600 text-xs font-mono mb-3">Connect wallet to fund the vault</p>
                <WalletConnect />
              </div>
            )}

            {/* How it works */}
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-[9px] text-zinc-600 font-mono mb-2">HOW IT WORKS</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { step: "1", label: "FUND", desc: "Send ALGO to vault" },
                  { step: "2", label: "DISCOVER", desc: "AI finds deals" },
                  { step: "3", label: "AUTO-PAY", desc: "Vault signs for you" },
                ].map(s => (
                  <div key={s.step} className="py-2">
                    <div className="text-cyan-500 font-orbitron text-xs mb-1">{s.step}</div>
                    <div className="text-zinc-300 text-[10px] font-mono font-bold">{s.label}</div>
                    <div className="text-zinc-700 text-[9px] font-mono">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════ MARKETPLACE ══════════ */}
      <section id="marketplace" className="min-h-screen pt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">

          <div className="section-label mb-2">MARKETPLACE // AI AGENT COMMERCE</div>
          <h2 className="font-orbitron font-bold text-white mb-8" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
            On-Chain <span className="text-cyan-400">Exchange</span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* ── Left: Browse ── */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="section-label">LISTING BROWSER</div>

              <div className="flex gap-2">
                <select
                  value={marketFilter}
                  onChange={e => setMarketFilter(e.target.value)}
                  className="input-cp rounded-lg px-3 py-2 text-xs flex-1 font-mono"
                >
                  <option value="">All Services</option>
                  {SERVICE_TYPES.map(t => (
                    <option key={t.value} value={t.value} className="bg-[#0b0b1a]">{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={fetchBrowseListings}
                  disabled={isBrowsing}
                  className="btn-cyan px-4 py-2 text-xs font-mono rounded-lg"
                >
                  {isBrowsing ? "..." : "SCAN"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[60vh] pr-0.5">
                {isBrowsing && (
                  [...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-[var(--bg-card)] animate-shimmer border border-[var(--border)]" />
                  ))
                )}

                {!isBrowsing && browseListings.map((listing, i) => (
                  <div
                    key={listing.txId}
                    className="neon-card rounded-xl p-3 animate-fade-in"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-zinc-200 text-sm font-medium truncate">{listing.service}</span>
                          {listing.zkCommitment && <span className="badge-mag">ZK</span>}
                        </div>
                        <div className="text-zinc-600 text-[10px] font-mono mb-1">{listing.type} · Round {listing.round}</div>
                        <a
                          href={`https://lora.algokit.io/testnet/transaction/${listing.txId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-cyan-600 hover:text-cyan-300 font-mono transition-colors underline break-all"
                          title={listing.txId}
                        >
                          {listing.txId}
                        </a>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <div>
                          <div className="font-orbitron font-bold text-[var(--green)]">{listing.price}</div>
                          <div className="text-[10px] text-zinc-700">ALGO</div>
                        </div>
                        <button
                          onClick={() => {
                            document.getElementById("marketplace")?.scrollIntoView({ behavior: "smooth" });
                            handleSubmit(
                              `Buy ${listing.service} under ${(listing.price * 1.3).toFixed(3)} ALGO`,
                              true,
                            );
                          }}
                          disabled={isLoading}
                          className="btn-solid-cyan px-3 py-1 text-[10px] font-orbitron tracking-wide rounded disabled:opacity-40"
                        >
                          BUY VIA AGENT
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {!isBrowsing && browseFetched && browseListings.length === 0 && (
                  <div className="neon-card rounded-xl p-8 text-center">
                    <div className="text-4xl opacity-10 mb-3">◈</div>
                    <p className="text-zinc-600 text-sm font-mono">No listings found.<br />Run AI commerce to seed data.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: AI Pipeline ── */}
            <div className="lg:col-span-3 flex flex-col gap-4">

              {/* Agent terminal */}
              <div className="terminal rounded-xl flex flex-col" style={{ minHeight: "380px", maxHeight: "52vh" }}>
                {/* Terminal top bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-cyan-500/10 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--red)" }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--yellow)" }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--green)" }} />
                  <span className="ml-2 text-[10px] font-mono text-zinc-700">A2A_COMMERCE_AGENT v1.0 // ALGORAND TESTNET</span>
                  <span className={`ml-auto text-[10px] font-mono ${phaseConfig.color}`}>[{phaseConfig.label}]</span>
                </div>

                {/* Terminal body */}
                <div
                  ref={chatRef}
                  className="flex-1 overflow-y-auto p-4 space-y-0.5"
                >
                  {session.actions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <div className="font-orbitron text-2xl text-cyan-500/20 mb-3 animate-blink">{">"}_</div>
                      <p className="text-zinc-700 text-xs font-mono mb-6">
                        System ready. Enter a purchase intent below.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {INTENT_SUGGESTIONS.map(s => (
                          <button
                            key={s}
                            onClick={() => handleSubmit(s)}
                            disabled={isLoading}
                            className="px-3 py-1.5 text-[10px] font-mono border border-cyan-500/15 text-zinc-600 rounded hover:border-cyan-500/40 hover:text-zinc-300 transition-all"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    session.actions.map(action => (
                      <ActionLine key={action.id} action={action} />
                    ))
                  )}
                  {isActive && (
                    <div className="flex items-center gap-1 text-cyan-400 text-[11px] font-mono mt-1">
                      <span className="animate-blink">█</span>
                      <span className="text-zinc-700 text-[10px]">processing...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Deal confirm bar */}
              {hasConfirmable && (
                <div
                  className="neon-card rounded-xl p-4 animate-fade-in"
                  style={{ borderColor: "rgba(0,255,136,0.3)", boxShadow: "0 0 20px rgba(0,255,136,0.06)" }}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-orbitron text-xs tracking-widest font-bold" style={{ color: "var(--green)" }}>
                        ✓ DEAL NEGOTIATED
                      </p>
                      <p className="text-zinc-400 text-xs mt-0.5 font-mono">
                        {session.selectedDeal!.sellerName} · {session.selectedDeal!.service}
                      </p>
                      <p className="text-zinc-600 text-[10px] font-mono">
                        {walletReady ? "Wallet connected — will sign payment" : vaultBalance > 0.1 ? "Vault auto-sign" : "Server-side payment"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-orbitron font-black text-2xl" style={{ color: "var(--green)" }}>
                        {session.selectedDeal!.finalPrice}
                        <span className="text-sm ml-1 font-normal">ALGO</span>
                      </div>
                      <button
                        onClick={() => setSession(prev => ({ ...prev, selectedDeal: null, phase: "idle" }))}
                        className="btn-mag px-4 py-1.5 text-xs rounded-lg font-mono"
                      >
                        CANCEL
                      </button>
                      <button
                        onClick={() => executeTransaction(session.selectedDeal!)}
                        className="btn-solid-green px-6 py-1.5 text-xs rounded-lg font-orbitron tracking-widest"
                      >
                        {walletReady ? "SIGN & PAY" : vaultBalance > 0.1 ? "VAULT PAY" : "CONFIRM"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment confirmed */}
              {session.escrow.status === "released" && (
                <div
                  className="neon-card rounded-xl p-4 animate-fade-in"
                  style={{ borderColor: "rgba(0,229,255,0.3)", background: "rgba(0,229,255,0.02)" }}
                >
                  <p className="font-orbitron text-[10px] tracking-widest text-cyan-400 mb-2">✓ PAYMENT CONFIRMED ON-CHAIN</p>
                  <div className="space-y-1 text-[11px] font-mono text-zinc-500">
                    {session.escrow.confirmedRound ? (
                      <div>ROUND: <span className="text-zinc-300">{session.escrow.confirmedRound}</span></div>
                    ) : null}
                    {session.escrow.amount ? (
                      <div>AMOUNT: <span style={{ color: "var(--green)" }}>{session.escrow.amount} ALGO</span></div>
                    ) : null}
                    <div className="text-[10px]" style={{ color: "var(--cyan)" }}>PROTOCOL: x402 / exact-avm (signless)</div>
                  </div>
                  {session.escrow.txId && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[9px] text-zinc-700 font-mono">TRANSACTION ID</div>
                      <a
                        href={`https://lora.algokit.io/testnet/transaction/${session.escrow.txId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="block text-[10px] text-cyan-500 hover:text-cyan-300 font-mono transition-colors underline break-all"
                      >
                        {session.escrow.txId}
                      </a>
                      <a
                        href={`https://lora.algokit.io/testnet/transaction/${session.escrow.txId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-block text-[10px] text-cyan-700 hover:text-cyan-400 font-mono transition-colors mt-1"
                      >
                        VIEW ON LORA EXPLORER ↗
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Credentials delivered after x402 payment */}
              {purchasedCreds && (
                <div className="animate-fade-in rounded-xl p-4" style={{ border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.03)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-green-400 text-base">🔐</span>
                    <span className="font-orbitron text-[10px] tracking-widest text-green-400">CREDENTIALS DELIVERED</span>
                    <span className="text-[9px] text-zinc-600 font-mono ml-auto">via x402 protocol</span>
                  </div>
                  {purchasedCreds.service && (
                    <div className="text-[10px] text-zinc-400 font-mono mb-3">
                      SERVICE: <span className="text-zinc-200">{purchasedCreds.service}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-zinc-900/60 rounded-lg px-3 py-2 gap-2">
                      <span className="text-[9px] text-zinc-500 font-mono shrink-0">USERNAME</span>
                      <span className="text-[11px] text-green-300 font-mono flex-1 break-all">{purchasedCreds.username}</span>
                      <button onClick={() => navigator.clipboard.writeText(purchasedCreds!.username)} className="text-[9px] text-zinc-600 hover:text-cyan-400 font-mono shrink-0">COPY</button>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-900/60 rounded-lg px-3 py-2 gap-2">
                      <span className="text-[9px] text-zinc-500 font-mono shrink-0">PASSWORD</span>
                      <span className="text-[11px] text-green-300 font-mono flex-1 break-all">
                        {showCredPassword ? purchasedCreds.password : "•".repeat(Math.min(purchasedCreds.password.length, 16))}
                      </span>
                      <button onClick={() => setShowCredPassword(p => !p)} className="text-[9px] text-zinc-600 hover:text-cyan-400 font-mono shrink-0">{showCredPassword ? "HIDE" : "SHOW"}</button>
                      <button onClick={() => navigator.clipboard.writeText(purchasedCreds!.password)} className="text-[9px] text-zinc-600 hover:text-cyan-400 font-mono shrink-0">COPY</button>
                    </div>
                    {purchasedCreds.notes && (
                      <div className="bg-zinc-900/40 rounded-lg px-3 py-2">
                        <div className="text-[9px] text-zinc-600 font-mono mb-1">NOTES</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{purchasedCreds.notes}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[9px] text-zinc-700 font-mono">
                    ⚠ Store these credentials securely. They will not persist after page refresh.
                  </div>
                </div>
              )}

              {/* Intent input */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={intentMsg}
                    onChange={e => setIntentMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSubmit(intentMsg); }}
                    placeholder={
                      isLoading
                        ? "Agent working..."
                        : "> Enter purchase intent (e.g. 'buy cloud storage under 1 ALGO')"
                    }
                    disabled={isLoading}
                    className="input-cp flex-1 rounded-xl px-4 py-3 text-sm font-mono"
                  />
                  <button
                    onClick={() => handleSubmit(intentMsg)}
                    disabled={isLoading || !intentMsg.trim()}
                    className="btn-solid-cyan px-6 py-3 text-xs font-orbitron tracking-widest rounded-xl flex items-center gap-2 shrink-0"
                  >
                    {isLoading ? (
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : "EXECUTE"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAutoBuy(p => !p)}
                    className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono border rounded transition-all ${
                      autoBuy
                        ? "text-green-400 border-green-500/30 bg-green-500/5"
                        : "text-zinc-600 border-zinc-800 hover:text-zinc-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoBuy ? "bg-green-400 animate-pulse" : "bg-zinc-700"}`} />
                    AUTO-BUY {autoBuy ? "ON — agent pays automatically" : "OFF — confirm before paying"}
                  </button>
                  {isInitialized && (
                    <span className="text-[10px] text-zinc-700 font-mono">
                      System initialized ✓
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ LOOKER ═══════════ */}
      <section id="looker" className="min-h-screen pt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">

          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <div className="section-label mb-2">LOOKER // LIVE NETWORK MONITOR</div>
              <h2 className="font-orbitron font-bold text-white" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
                Mission <span style={{ color: "var(--magenta)" }}>Control</span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--green)" }} />
              <span className="text-xs font-mono" style={{ color: "var(--green)" }}>LIVE</span>
              {lookerTs && (
                <span className="text-zinc-700 text-[10px] font-mono hidden sm:block">
                  Updated {lookerTs.toLocaleTimeString()}
                </span>
              )}
              <button onClick={fetchLookerData} className="btn-cyan px-3 py-1.5 text-[10px] font-mono rounded-lg ml-1">
                REFRESH
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Live listing feed */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <span className="section-label">LIVE LISTING FEED</span>
                <span className="badge-cyan ml-auto">{lookerEntries.length} records</span>
              </div>

              <div className="neon-card rounded-2xl p-4">
                {lookerEntries.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-5xl text-zinc-800 mb-4 animate-spin-slow">◈</div>
                    <p className="text-zinc-600 text-sm font-mono">Scanning Algorand Indexer...</p>
                    <p className="text-zinc-700 text-xs mt-1 font-mono">Auto-refreshes every 15 seconds</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
                    {lookerEntries.map((entry, i) => (
                      <a
                        key={entry.txId}
                        href={`https://lora.algokit.io/testnet/transaction/${entry.txId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl p-3 flex items-start gap-3 animate-fade-in group block border border-[var(--border)] bg-[var(--bg-card)] hover:border-cyan-500/30 transition-all"
                        style={{ animationDelay: `${i * 30}ms`, textDecoration: "none" }}
                      >
                        <div className="w-2 h-2 rounded-full bg-cyan-500/50 shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-zinc-200 text-sm group-hover:text-cyan-300 transition-colors">{entry.service}</span>
                            <span className="badge-cyan">{entry.type}</span>
                          </div>
                          <div className="text-zinc-600 text-[10px] font-mono mb-1">
                            Round {entry.round}
                          </div>
                          <div className="text-[10px] font-mono text-cyan-700 group-hover:text-cyan-400 transition-colors break-all">
                            {entry.txId}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-orbitron font-bold text-sm" style={{ color: "var(--green)" }}>{entry.price}</div>
                          <div className="text-[10px] text-zinc-700">ALGO</div>
                          <div className="text-[9px] text-cyan-700 group-hover:text-cyan-400 mt-1.5 font-mono transition-colors">
                            LORA ↗
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right panel */}
            <div className="space-y-4">

              {/* Reputation leaderboard */}
              <div className="neon-card rounded-2xl p-4">
                <div className="section-label mb-4">REPUTATION LEADERBOARD</div>
                {reputationBoard.length > 0 ? (
                  <div className="space-y-4">
                    {reputationBoard.map((agent, i) => (
                      <div key={agent.address}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-zinc-700 text-[10px] font-mono w-4 shrink-0">#{i + 1}</span>
                            <div className="min-w-0">
                              <span className="text-zinc-300 text-xs font-mono block">{agent.name}</span>
                              <span className="text-zinc-700 text-[9px] font-mono block truncate" title={agent.address}>
                                {agent.address.slice(0, 4)}…{agent.address.slice(-4)}
                              </span>
                            </div>
                          </div>
                          <span className={`font-orbitron font-bold text-sm shrink-0 ${
                            agent.score >= 80 ? "text-green-400" :
                            agent.score >= 50 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {agent.score}
                          </span>
                        </div>
                        <ScoreBar score={agent.score} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-700 text-xs font-mono">
                    Run AI commerce to see<br />live reputation scores.
                  </div>
                )}
              </div>

              {/* Session status */}
              <div className="neon-card rounded-2xl p-4">
                <div className="section-label mb-3">SESSION STATUS</div>
                <div className="space-y-2.5 text-xs font-mono">
                  {[
                    { k: "PHASE",        v: phaseConfig.label, cls: phaseConfig.color },
                    { k: "LISTINGS",     v: String(session.listings.length), cls: "text-zinc-300" },
                    { k: "NEGOTIATIONS", v: String(session.negotiations.length), cls: "text-zinc-300" },
                    {
                      k: "BEST DEAL",
                      v: session.selectedDeal ? `${session.selectedDeal.finalPrice} ALGO` : "—",
                      cls: session.selectedDeal ? "text-green-400" : "text-zinc-700",
                    },
                    {
                      k: "PAYMENT",
                      v: session.escrow.status === "released" ? "CONFIRMED" : "PENDING",
                      cls: session.escrow.status === "released" ? "text-green-400" : "text-zinc-700",
                    },
                  ].map(row => (
                    <div key={row.k} className="flex justify-between">
                      <span className="text-zinc-600">{row.k}</span>
                      <span className={row.cls}>{row.v}</span>
                    </div>
                  ))}
                  {session.escrow.txId && (
                    <div className="pt-2 border-t border-[var(--border)]">
                      <div className="text-zinc-600 mb-0.5 text-[9px]">TRANSACTION</div>
                      <a
                        href={`https://lora.algokit.io/testnet/transaction/${session.escrow.txId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-cyan-500 hover:text-cyan-300 transition-colors break-all block underline"
                      >
                        {session.escrow.txId}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Network */}
              <div className="neon-card rounded-2xl p-4">
                <div className="section-label mb-3">NETWORK</div>
                <div className="space-y-2 text-xs font-mono">
                  {[
                    { k: "CHAIN",    v: "ALGORAND" },
                    { k: "NETWORK",  v: "TESTNET" },
                    { k: "FINALITY", v: "~3.9s" },
                    { k: "INDEXER",  v: lookerTs ? "ACTIVE" : "CONNECTING..." },
                  ].map(row => (
                    <div key={row.k} className="flex justify-between">
                      <span className="text-zinc-600">{row.k}</span>
                      <span className="text-cyan-400">{row.v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                  <div className="text-[9px] text-zinc-600 font-mono">SMART CONTRACTS</div>
                  <a
                    href="https://lora.algokit.io/testnet/application/757478982"
                    target="_blank" rel="noopener noreferrer"
                    className="flex justify-between items-center text-[10px] font-mono hover:bg-cyan-500/5 rounded-lg px-2 py-1.5 -mx-2 transition-colors group"
                  >
                    <span className="text-zinc-500 group-hover:text-zinc-300">REPUTATION</span>
                    <span className="text-cyan-600 group-hover:text-cyan-400 transition-colors">757478982 ↗</span>
                  </a>
                  <a
                    href="https://lora.algokit.io/testnet/application/757481776"
                    target="_blank" rel="noopener noreferrer"
                    className="flex justify-between items-center text-[10px] font-mono hover:bg-cyan-500/5 rounded-lg px-2 py-1.5 -mx-2 transition-colors group"
                  >
                    <span className="text-zinc-500 group-hover:text-zinc-300">ZK COMMITMENT</span>
                    <span className="text-cyan-600 group-hover:text-cyan-400 transition-colors">757481776 ↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════ FOOTER ═════════ */}
      <footer className="border-t border-[var(--border)] py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 border border-cyan-500/40 flex items-center justify-center"
              style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
            >
              <span className="font-orbitron text-[6px] font-black text-cyan-400">A2A</span>
            </div>
            <span className="font-orbitron text-[10px] text-zinc-700 tracking-widest">
              A2A<span className="text-cyan-600">.</span>COMMERCE // ALGORAND TESTNET
            </span>
          </div>
          <div className="flex items-center gap-6 text-[10px] text-zinc-700 font-mono">
            <a
              href="https://lora.algokit.io/testnet/application/757478982"
              target="_blank" rel="noopener noreferrer"
              className="hover:text-cyan-500 transition-colors"
            >
              CONTRACT ↗
            </a>
            <a
              href="https://developer.algorand.org"
              target="_blank" rel="noopener noreferrer"
              className="hover:text-cyan-500 transition-colors"
            >
              DOCS ↗
            </a>
            <span className="text-zinc-800">Built on Algorand</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
