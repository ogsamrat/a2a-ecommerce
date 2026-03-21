"use client";

import { useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  Package,
  Tag,
  FileText,
  Coins,
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  Cpu,
  Globe,
  Database,
} from "lucide-react";

const TYPES = [
  { value: "cloud-storage", label: "Cloud Storage", icon: Database },
  { value: "api-access", label: "API Access", icon: Layers },
  { value: "compute", label: "Compute", icon: Cpu },
  { value: "hosting", label: "Hosting", icon: Globe },
] as const;
type SvcType = (typeof TYPES)[number]["value"];

interface Form {
  type: SvcType | "";
  service: string;
  price: string;
  description: string;
}
interface Listing {
  txId: string;
  type: string;
  service: string;
  price: number;
  description: string;
  zkCommitment?: string;
}
interface Status {
  kind: "success" | "error" | "info";
  text: string;
  txId?: string;
  explorerUrl?: string;
}

const TYPE_BADGE: Record<string, string> = {
  "cloud-storage": "type-cloud",
  "api-access": "type-api",
  compute: "type-compute",
  hosting: "type-hosting",
};
const TYPE_LABEL: Record<string, string> = {
  "cloud-storage": "Cloud Storage",
  "api-access": "API Access",
  compute: "Compute",
  hosting: "Hosting",
};

export function SellSection() {
  const { activeAccount, signTransactions } = useWallet();
  const [form, setForm] = useState<Form>({
    type: "",
    service: "",
    price: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingL, setLoadingL] = useState(false);
  const [zkSecret, setZkSecret] = useState<string | null>(null);

  async function refresh() {
    if (!activeAccount) return;
    setLoadingL(true);
    try {
      const d = await (
        await fetch(
          `/api/listings/fetch?seller=${encodeURIComponent(activeAccount.address)}`,
        )
      ).json();
      setListings(d.listings ?? []);
    } finally {
      setLoadingL(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.type || !form.service.trim() || !form.price || !form.description.trim())
      return;
    setBusy(true);
    setStatus({ kind: "info", text: "Preparing listing transaction…" });
    try {
      const sender = activeAccount?.address ?? "DEMO_ADDRESS";
      const d = await (
        await fetch("/api/listings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: sender,
            type: form.type,
            service: form.service.trim(),
            price: parseFloat(form.price),
            description: form.description.trim(),
          }),
        })
      ).json();
      if (d.error) throw new Error(d.error);
      if (d.zkSecret) setZkSecret(d.zkSecret);

      if (activeAccount && d.unsignedTxn) {
        setStatus({ kind: "info", text: "Waiting for wallet signature…" });
        const bytes = Uint8Array.from(atob(d.unsignedTxn), (c) =>
          c.charCodeAt(0),
        );
        const signed = (await signTransactions([bytes]))[0];
        if (!signed) throw new Error("Empty signature");
        const b64 = btoa(String.fromCharCode(...Array.from(signed)));
        setStatus({ kind: "info", text: "Submitting to Algorand…" });
        const sub = await (
          await fetch("/api/wallet/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signedTxn: b64 }),
          })
        ).json();
        if (sub.error) throw new Error(sub.error);
        setStatus({
          kind: "success",
          text: "Listing confirmed on-chain!",
          txId: sub.txId,
          explorerUrl: sub.explorerUrl,
        });
      } else {
        setStatus({
          kind: "success",
          text: "Unsigned txn prepared. Connect wallet to sign.",
          txId: d.txnId,
        });
      }
      setForm((f) => ({ ...f, service: "", price: "", description: "" }));
      await refresh();
    } catch (e) {
      setStatus({
        kind: "error",
        text: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  const selType = TYPES.find((t) => t.value === form.type);

  return (
    <div className="scroll" style={{ flex: 1 }}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {/* Header */}
        <div className="anim-fade-up">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-sm)",
                background: "var(--blue-glow)",
                border: "1px solid var(--blue-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Package size={16} color="var(--blue-bright)" />
            </div>
            <h1
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--text-1)",
              }}
            >
              List Your Product
            </h1>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
            Create an on-chain listing discoverable by AI buyer agents.
          </p>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}
        >
          {/* ── Form ── */}
          <div
            className="anim-fade-up surface"
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {/* Type */}
            <div>
              <p
                className="section-label"
                style={{ paddingInline: 0, marginBottom: 8 }}
              >
                Service Type
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = form.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: active
                          ? "var(--blue-glow)"
                          : "var(--bg-input)",
                        border: active
                          ? "1px solid var(--blue-border)"
                          : "1px solid var(--border)",
                        color: active ? "var(--blue-bright)" : "var(--text-3)",
                        fontSize: "0.8rem",
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "var(--font)",
                        transition: "all 0.15s",
                      }}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* fields */}
            {[
              {
                label: "Service Name",
                icon: Tag,
                key: "service",
                type: "text",
                placeholder: `e.g. "Enterprise ${selType ? selType.label : 'Service'} Pro"`,
              },
            ].map((f) => (
              <div key={f.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 6,
                  }}
                >
                  <f.icon size={12} color="var(--text-4)" />
                  <p
                    className="section-label"
                    style={{ paddingInline: 0, fontSize: "0.65rem" }}
                  >
                    {f.label}
                  </p>
                </div>
                <input
                  className="trae-input"
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as unknown as Record<string, string>)[f.key]}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [f.key]: e.target.value }))
                  }
                  required
                />
              </div>
            ))}

            {/* Price */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <Coins size={12} color="var(--text-4)" />
                <p
                  className="section-label"
                  style={{ paddingInline: 0, fontSize: "0.65rem" }}
                >
                  Price (ALGO)
                </p>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="trae-input"
                  type="number"
                  placeholder="0.50"
                  min="0.001"
                  step="0.001"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  style={{ paddingRight: 52 }}
                  required
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontFamily: "var(--mono)",
                    fontSize: "0.75rem",
                    color: "var(--blue-bright)",
                    fontWeight: 600,
                  }}
                >
                  ALGO
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <FileText size={12} color="var(--text-4)" />
                <p
                  className="section-label"
                  style={{ paddingInline: 0, fontSize: "0.65rem" }}
                >
                  Description
                </p>
              </div>
              <textarea
                className="trae-input"
                rows={4}
                placeholder="Describe your service — AI agents read this during discovery…"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                style={{ resize: "none" }}
                required
              />
            </div>

            {/* Status */}
            {status && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background:
                    status.kind === "success"
                      ? "rgba(46,240,161,0.06)"
                      : status.kind === "error"
                        ? "rgba(255,107,107,0.06)"
                        : "var(--blue-glow)",
                  border: `1px solid ${status.kind === "success" ? "var(--green-border)" : status.kind === "error" ? "rgba(255,107,107,0.2)" : "var(--blue-border)"}`,
                }}
              >
                {status.kind === "success" ? (
                  <CheckCircle
                    size={14}
                    color="var(--green)"
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                ) : status.kind === "error" ? (
                  <AlertCircle
                    size={14}
                    color="#ff6b6b"
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                ) : (
                  <div
                    className="anim-spin"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid var(--blue-border)",
                      borderTopColor: "var(--blue-bright)",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  />
                )}
                <div>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color:
                        status.kind === "success"
                          ? "var(--green)"
                          : status.kind === "error"
                            ? "#ff6b6b"
                            : "var(--blue-bright)",
                    }}
                  >
                    {status.text}
                  </p>
                  {status.txId && (
                    <p
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "0.7rem",
                        color: "var(--text-3)",
                        marginTop: 3,
                      }}
                    >
                      TX: {status.txId.slice(0, 28)}…
                    </p>
                  )}
                  {status.explorerUrl && (
                    <a
                      href={status.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "0.7rem",
                        color: "var(--blue-bright)",
                        marginTop: 4,
                        textDecoration: "none",
                      }}
                    >
                      View on Explorer <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            )}

            <button
              className="btn-primary"
              disabled={busy}
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              style={{ justifyContent: "center", padding: "0.625rem" }}
            >
              {busy ? (
                <div
                  className="anim-spin"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                  }}
                />
              ) : (
                <Plus size={15} />
              )}
              {busy ? "Processing…" : "List on Algorand"}
            </button>

            {!activeAccount && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "var(--text-4)",
                }}
              >
                Connect wallet to sign and publish on-chain
              </p>
            )}
          </div>

          {/* ── My Listings ── */}
          <div
            className="anim-fade-up d-100 surface"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-2)",
                }}
              >
                My Listings
              </span>
              <button
                className="btn-ghost"
                onClick={refresh}
                disabled={!activeAccount || loadingL}
                style={{ padding: "4px 8px" }}
              >
                <RefreshCw size={12} className={loadingL ? "anim-spin" : ""} />
              </button>
            </div>

            {!activeAccount ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  paddingBlock: 32,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Package size={16} color="var(--text-4)" />
                </div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-4)",
                    textAlign: "center",
                  }}
                >
                  Connect wallet to view your listings
                </p>
              </div>
            ) : listings.length === 0 ? (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-4)",
                  textAlign: "center",
                  paddingBlock: 24,
                }}
              >
                {loadingL ? "Loading…" : "No listings yet"}
              </p>
            ) : (
              <div
                className="scroll"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  flex: 1,
                }}
              >
                {listings.map((l) => (
                  <div
                    key={l.txId}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <p
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "var(--text-1)",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {l.service}
                      </p>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "var(--blue-bright)",
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {l.price}{" "}
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--text-3)",
                          }}
                        >
                          ALGO
                        </span>
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        className={`badge ${TYPE_BADGE[l.type] ?? "badge-white"}`}
                      >
                        {TYPE_LABEL[l.type] ?? l.type}
                      </span>
                      {l.zkCommitment && (
                        <span
                          className="badge badge-blue"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Shield size={9} /> ZK
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {zkSecret && (
              <div
                style={{
                  background: "rgba(255,107,107,0.06)",
                  border: "1px solid rgba(255,107,107,0.2)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  flexShrink: 0,
                }}
              >
                <p
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "#ff6b6b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  ZK Secret — Save This!
                </p>
                <p
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.65rem",
                    color: "var(--text-3)",
                    wordBreak: "break-all",
                    lineHeight: 1.5,
                  }}
                >
                  {zkSecret}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
