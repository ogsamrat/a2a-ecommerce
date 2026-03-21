"use client";

import { useState, useEffect } from "react";
import { Search, RefreshCw, Shield, ExternalLink, Filter, Database, Layers, Cpu, Globe, ChevronDown } from "lucide-react";
import type { OnChainListing } from "@/lib/agents/types";

const TYPES = [
  { value:"",              label:"All",     icon:Filter   },
  { value:"cloud-storage", label:"Cloud",   icon:Database },
  { value:"api-access",    label:"API",     icon:Layers   },
  { value:"compute",       label:"Compute", icon:Cpu      },
  { value:"hosting",       label:"Hosting", icon:Globe    },
];

const TYPE_META: Record<string,{ cls:string; label:string }> = {
  "cloud-storage": { cls:"type-cloud",   label:"Cloud Storage" },
  "api-access":    { cls:"type-api",     label:"API Access"    },
  "compute":       { cls:"type-compute", label:"Compute"       },
  "hosting":       { cls:"type-hosting", label:"Hosting"       },
};

export function MarketplaceSection() {
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [loading, setLoading]   = useState(false);
  const [typeF, setTypeF]       = useState("");
  const [budget, setBudget]     = useState("");
  const [search, setSearch]     = useState("");
  const [loaded, setLoaded]     = useState(false);

  async function fetch_(t=typeF, b=budget) {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (t) p.set("type",t);
      if (b) p.set("maxBudget",b);
      const d = await (await fetch(`/api/listings/fetch?${p}`)).json();
      setListings(d.listings ?? []);
      setLoaded(true);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const filtered = listings.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [l.service,l.seller,l.description,l.type].some(s => s?.toLowerCase().includes(q));
  });

  return (
    <div className="scroll" style={{ flex:1 }}>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 24px", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Header */}
        <div className="anim-fade-up">
          <h1 style={{ fontSize:"1.125rem", fontWeight:700, color:"var(--text-1)", marginBottom:4 }}>Marketplace</h1>
          <p style={{ fontSize:"0.8rem", color:"var(--text-3)" }}>
            On-chain service listings discoverable by AI buyer agents.
          </p>
        </div>

        {/* Toolbar */}
        <div className="anim-fade-up d-50" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <div style={{ position:"relative", flex:1, minWidth:180 }}>
            <Search size={13} color="var(--text-4)" style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
            <input className="trae-input" placeholder="Search by name, seller, type…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft:34 }} />
          </div>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:"0.7rem", color:"var(--text-4)", fontFamily:"var(--mono)", pointerEvents:"none" }}>
              ≤
            </span>
            <input className="trae-input" type="number" placeholder="Max ALGO" min="0" step="0.1"
              value={budget} onChange={e => setBudget(e.target.value)} onBlur={() => fetch_(typeF, budget)}
              style={{ width:120, paddingLeft:22 }} />
          </div>
          <button className="btn-secondary" onClick={() => fetch_()} style={{ gap:6 }}>
            <RefreshCw size={13} className={loading ? "anim-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Type tabs */}
        <div className="anim-fade-up d-100" style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
          {TYPES.map(t => {
            const Icon = t.icon;
            const active = typeF === t.value;
            return (
              <button key={t.value} onClick={() => { setTypeF(t.value); fetch_(t.value); }}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"5px 12px", borderRadius:"var(--radius-sm)",
                  background: active ? "var(--blue-glow)" : "transparent",
                  border: active ? "1px solid var(--blue-border)" : "1px solid var(--border)",
                  color: active ? "var(--blue-bright)" : "var(--text-3)",
                  fontSize:"0.8rem", fontWeight:500, cursor:"pointer", fontFamily:"var(--font)",
                  transition:"all 0.15s",
                }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
          <span style={{ marginLeft:"auto", fontFamily:"var(--mono)", fontSize:"0.7rem", color:"var(--text-4)" }}>
            {filtered.length} listing{filtered.length!==1?"s":""}
          </span>
        </div>

        {/* Grid */}
        {!loaded || (loading && !loaded) ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
            {Array.from({length:6}).map((_,i) => (
              <div key={i} className="anim-shimmer" style={{ height:160, borderRadius:"var(--radius-lg)", border:"1px solid var(--border)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", paddingBlock:60, gap:12, border:"1px dashed var(--border)", borderRadius:"var(--radius-lg)" }}>
            <Search size={24} color="var(--text-4)" />
            <p style={{ fontSize:"0.8rem", color:"var(--text-4)" }}>
              {loaded ? "No listings match your filters" : "Loading…"}
            </p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
            {filtered.map((l,i) => <MarketCard key={l.txId} listing={l} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketCard({ listing, index }: { listing:OnChainListing; index:number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[listing.type] ?? { cls:"badge-white", label:listing.type };

  return (
    <div className={`surface surface-hover anim-stagger-up`}
      style={{ padding:16, display:"flex", flexDirection:"column", gap:10, animationDelay:`${index*50}ms`, position:"relative" }}>

      {/* Top */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ fontSize:"0.875rem", fontWeight:600, color:"var(--text-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {listing.service}
          </p>
          <p style={{ fontFamily:"var(--mono)", fontSize:"0.7rem", color:"var(--text-4)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {listing.seller}
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end", flexShrink:0 }}>
          <span className={`badge ${meta.cls}`}>{meta.label}</span>
          {listing.zkCommitment && (
            <span className="badge badge-blue" style={{ display:"flex",alignItems:"center",gap:3 }}>
              <Shield size={9} />ZK
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize:"0.78rem", color:"var(--text-3)", lineHeight:1.65, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:expanded?99:2, WebkitBoxOrient:"vertical" }}>
        {listing.description}
      </p>
      {(listing.description?.length ?? 0) > 80 && (
        <button onClick={() => setExpanded(v=>!v)}
          style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-4)",fontSize:"0.7rem",display:"flex",alignItems:"center",gap:3,padding:0,fontFamily:"var(--font)" }}>
          <ChevronDown size={12} style={{ transform:expanded?"rotate(180deg)":"none", transition:"transform 0.2s" }} />
          {expanded?"Less":"More"}
        </button>
      )}

      {/* Footer */}
      <div style={{ marginTop:"auto", paddingTop:10, borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:"1rem", fontWeight:700, color:"var(--blue-bright)" }}>
            {listing.price}
          </span>
          <span style={{ fontFamily:"var(--mono)", fontSize:"0.7rem", color:"var(--text-4)" }}>ALGO</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:"0.65rem", color:"var(--text-4)" }}>#{listing.round}</span>
          <a href={`https://testnet.explorer.perawallet.app/tx/${listing.txId}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color:"var(--text-4)", transition:"color 0.15s", display:"flex" }}
            onMouseEnter={e=>(e.currentTarget.style.color="var(--blue-bright)")}
            onMouseLeave={e=>(e.currentTarget.style.color="var(--text-4)")}>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
