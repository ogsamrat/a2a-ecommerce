"use client";

import type { OnChainListing, NegotiationSession } from "@/lib/agents/types";
import { Shield, TrendingDown, CheckCircle, XCircle, ExternalLink } from "lucide-react";

const TYPE_META: Record<string,{ cls:string; label:string }> = {
  "cloud-storage": { cls:"type-cloud",   label:"Cloud Storage" },
  "api-access":    { cls:"type-api",     label:"API Access"    },
  "compute":       { cls:"type-compute", label:"Compute"       },
  "hosting":       { cls:"type-hosting", label:"Hosting"       },
};

interface ListingCardProps {
  listing: OnChainListing;
  negotiation?: NegotiationSession;
  isSelected: boolean;
}

export function ListingCard({ listing, negotiation, isSelected }: ListingCardProps) {
  const meta    = TYPE_META[listing.type] ?? { cls:"badge-white", label:listing.type };
  const savings = negotiation?.accepted
    ? Math.round(((listing.price - negotiation.finalPrice) / listing.price) * 100) : 0;

  return (
    <div style={{
      background: isSelected ? "var(--blue-glow)" : "var(--bg-card)",
      border: `1px solid ${isSelected ? "var(--blue-border)" : "var(--border)"}`,
      borderRadius: "var(--radius-md)",
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      boxShadow: isSelected ? "0 0 16px rgba(43,127,255,0.1)" : "none",
      transition: "all 0.2s",
    }}>
      {/* Top */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--text-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {listing.seller}
          </p>
          <span className={`badge ${meta.cls}`} style={{ marginTop:4 }}>{meta.label}</span>
        </div>
        {listing.zkCommitment && (
          <span className="badge badge-blue" style={{ display:"flex", alignItems:"center", gap:3, flexShrink:0 }}>
            <Shield size={9} /> ZK
          </span>
        )}
      </div>

      {/* Description */}
      <p style={{ fontSize:"0.75rem", color:"var(--text-3)", lineHeight:1.55,
        overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
        {listing.description}
      </p>

      {/* TX / round */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontFamily:"var(--mono)", fontSize:"0.65rem", color:"var(--text-4)" }}>
          #{listing.round}
        </span>
        <a href={`https://testnet.explorer.perawallet.app/tx/${listing.txId}`} target="_blank" rel="noopener noreferrer"
          style={{ color:"var(--text-4)", display:"flex" }}
          onMouseEnter={e=>(e.currentTarget.style.color="var(--blue-bright)")}
          onMouseLeave={e=>(e.currentTarget.style.color="var(--text-4)")}>
          <ExternalLink size={11} />
        </a>
      </div>

      {/* Price */}
      <div style={{ paddingTop:8, borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        {negotiation ? (
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ fontFamily:"var(--mono)", fontSize:"0.75rem", textDecoration:"line-through", color:"var(--text-4)" }}>
              {listing.price}
            </span>
            <span style={{ fontFamily:"var(--mono)", fontSize:"0.9rem", fontWeight:700, color: negotiation.accepted ? "var(--green)" : "#ff6b6b" }}>
              {negotiation.finalPrice} <span style={{ fontSize:"0.65rem", fontWeight:400, color:"var(--text-4)" }}>ALGO</span>
            </span>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
            <span style={{ fontFamily:"var(--mono)", fontSize:"0.9rem", fontWeight:700, color:"var(--blue-bright)" }}>
              {listing.price}
            </span>
            <span style={{ fontFamily:"var(--mono)", fontSize:"0.65rem", color:"var(--text-4)" }}>ALGO</span>
          </div>
        )}
        {negotiation && (
          <span style={{ fontSize:"0.7rem", fontWeight:600, display:"flex", alignItems:"center", gap:3,
            color: negotiation.accepted ? "var(--green)" : "#ff6b6b" }}>
            {negotiation.accepted ? <CheckCircle size={11} /> : <XCircle size={11} />}
            {negotiation.accepted ? "DEAL" : "NO DEAL"}
          </span>
        )}
      </div>

      {/* Savings */}
      {negotiation?.accepted && savings > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:"0.7rem", color:"var(--blue-bright)" }}>
          <TrendingDown size={11} /> Saved {savings}%
        </div>
      )}

      {isSelected && (
        <div style={{ padding:"4px 0", textAlign:"center", background:"var(--blue-glow)",
          border:"1px solid var(--blue-border)", borderRadius:"var(--radius-sm)" }}>
          <span style={{ fontSize:"0.65rem", fontWeight:700, color:"var(--blue-bright)", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"var(--mono)" }}>
            Best Deal
          </span>
        </div>
      )}
    </div>
  );
}
