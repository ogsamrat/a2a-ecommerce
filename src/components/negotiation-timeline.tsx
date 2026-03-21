"use client";

import type { NegotiationSession } from "@/lib/agents/types";
import { ArrowRight, Shield, CheckCircle, XCircle } from "lucide-react";

interface Props { sessions: NegotiationSession[]; }

const ACTION_COLOR: Record<string, string> = {
  accept:  "var(--green)",
  offer:   "var(--blue-bright)",
  counter: "#fbbf24",
  reject:  "#ff6b6b",
};

export function NegotiationTimeline({ sessions }: Props) {
  if (sessions.length === 0) return null;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <p className="section-label" style={{ paddingInline:0 }}>
        <ArrowRight size={10} style={{ display:"inline", marginRight:4 }} />
        Negotiation Log
      </p>

      {sessions.map(s => (
        <div key={s.listingTxId} style={{
          background:"var(--bg-card)", border:"1px solid var(--border)",
          borderRadius:"var(--radius-md)", padding:"10px 12px",
          display:"flex", flexDirection:"column", gap:8,
        }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--text-1)" }}>{s.sellerName}</span>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {s.zkVerified && (
                <span className="badge badge-blue" style={{ display:"flex", alignItems:"center", gap:2 }}>
                  <Shield size={8} /> ZK
                </span>
              )}
              <span style={{ fontSize:"0.7rem", fontWeight:600, display:"flex", alignItems:"center", gap:3,
                color: s.accepted ? "var(--green)" : "#ff6b6b" }}>
                {s.accepted ? <CheckCircle size={11} /> : <XCircle size={11} />}
                {s.accepted ? "Accepted" : "Rejected"}
              </span>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ position:"relative", paddingLeft:14 }}>
            <div style={{ position:"absolute", left:5, top:0, bottom:0, width:1, background:"var(--border)" }} />
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {s.messages.map(m => {
                const c = ACTION_COLOR[m.action] ?? "#ff6b6b";
                return (
                  <div key={m.id} style={{ position:"relative" }}>
                    <div style={{ position:"absolute", left:-10, top:4, width:8, height:8, borderRadius:"50%",
                      background: `${c}22`, border:`1.5px solid ${c}` }} />
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:"0.65rem", fontWeight:700, color:c, textTransform:"uppercase", fontFamily:"var(--mono)" }}>
                        {m.action}
                      </span>
                      <span style={{ fontSize:"0.65rem", color:"var(--text-4)" }}>{m.from}</span>
                      <span style={{ fontFamily:"var(--mono)", fontSize:"0.7rem", fontWeight:600, color:"var(--text-2)" }}>
                        {m.payload.price} ALGO
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div style={{ paddingTop:8, borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:"var(--mono)", fontSize:"0.7rem", color:"var(--text-3)" }}>
              {s.originalPrice} → {s.finalPrice} ALGO
            </span>
            {s.accepted && (
              <span style={{ fontFamily:"var(--mono)", fontSize:"0.7rem", fontWeight:700, color:"var(--blue-bright)" }}>
                −{Math.round(((s.originalPrice - s.finalPrice) / s.originalPrice) * 100)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
