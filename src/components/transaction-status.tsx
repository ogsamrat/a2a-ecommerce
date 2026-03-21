"use client";

import type { EscrowState } from "@/lib/agents/types";
import { CheckCircle, ExternalLink, Zap } from "lucide-react";

interface Props { escrow: EscrowState; }

export function TransactionStatus({ escrow }: Props) {
  if (escrow.status === "idle") return null;

  const rows = [
    { label:"Amount",  value:`${escrow.amount} ALGO`,        mono:true },
    { label:"Round",   value:String(escrow.confirmedRound),  mono:true },
    { label:"TX ID",   value:`${escrow.txId.slice(0,10)}…${escrow.txId.slice(-6)}`, mono:true },
    { label:"Buyer",   value: escrow.buyerAddress  ? `${escrow.buyerAddress.slice(0,8)}…${escrow.buyerAddress.slice(-4)}`  : "—", mono:true },
    { label:"Seller",  value: escrow.sellerAddress ? `${escrow.sellerAddress.slice(0,8)}…${escrow.sellerAddress.slice(-4)}` : "—", mono:true },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <p className="section-label" style={{ paddingInline:0 }}>
        <Zap size={10} style={{ display:"inline", marginRight:4 }} />
        On-Chain Transaction
      </p>

      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"10px 12px", display:"flex", flexDirection:"column", gap:10 }}>

        {/* Confirmed banner */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 10px", background:"rgba(46,240,161,0.06)", border:"1px solid var(--green-border)", borderRadius:"var(--radius-sm)" }}>
          <CheckCircle size={13} color="var(--green)" />
          <span style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--green)" }}>Payment Confirmed</span>
        </div>

        {/* Rows */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {rows.map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:"0.7rem", color:"var(--text-4)" }}>{r.label}</span>
              <span style={{ fontFamily: r.mono ? "var(--mono)" : "var(--font)", fontSize:"0.7rem", color:"var(--text-2)" }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* Explorer link */}
        <a href={`https://testnet.explorer.perawallet.app/tx/${escrow.txId}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            padding:"6px", borderRadius:"var(--radius-sm)",
            background:"rgba(43,127,255,0.06)", border:"1px solid var(--blue-border)",
            color:"var(--blue-bright)", fontSize:"0.75rem", textDecoration:"none",
            transition:"background 0.15s",
          }}
          onMouseEnter={e=>(e.currentTarget.style.background="rgba(43,127,255,0.1)")}
          onMouseLeave={e=>(e.currentTarget.style.background="rgba(43,127,255,0.06)")}>
          <ExternalLink size={12} />
          View on Pera Explorer
        </a>
      </div>
    </div>
  );
}
