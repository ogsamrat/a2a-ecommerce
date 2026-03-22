"use client";

import { useEffect, useRef } from "react";
import type { AgentAction } from "@/lib/agents/types";
import { Bot, User, Cpu, Zap, ArrowRight, ExternalLink } from "lucide-react";

interface ChatInterfaceProps {
  actions: AgentAction[];
}

const AGENT_CFG: Record<
  string,
  { Icon: typeof Bot; color: string; label: string }
> = {
  user: { Icon: User, color: "var(--blue-bright)", label: "You" },
  buyer: { Icon: Bot, color: "var(--green)", label: "Buyer Agent" },
  seller: { Icon: Cpu, color: "#fbbf24", label: "Seller Agent" },
  system: { Icon: Zap, color: "var(--text-3)", label: "System" },
};

const TYPE_CFG: Record<string, { label: string; cls: string }> = {
  thinking: { label: "thinking", cls: "badge-white" },
  message: { label: "message", cls: "badge-white" },
  negotiation: { label: "negotiation", cls: "badge-blue" },
  transaction: { label: "tx", cls: "badge-blue" },
  result: { label: "result", cls: "badge-green" },
};

function truncateIdentifier(value: string): string {
  const raw = value.trim();
  if (raw.length <= 24) return raw;
  return `${raw.slice(0, 12)}...${raw.slice(-8)}`;
}

function truncateLongIdsInText(value: string): string {
  // Truncate long uppercase/alphanumeric IDs (TX IDs, addresses) to avoid layout overlap.
  return value.replace(/\b[A-Z0-9]{28,}\b/g, (match) =>
    truncateIdentifier(match),
  );
}

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[.*?\]\(.*?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={i} style={{ color: "var(--text-1)", fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code
          key={i}
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 4,
            padding: "1px 5px",
            fontFamily: "var(--mono)",
            fontSize: "0.8em",
            color: "var(--text-2)",
          }}
        >
          {truncateIdentifier(part.slice(1, -1))}
        </code>
      );
    const m = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (m)
      return (
        <a
          key={i}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--blue-bright)",
            textDecoration: "underline",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {m[1]}
          <ExternalLink size={10} />
        </a>
      );
    return <span key={i}>{truncateLongIdsInText(part)}</span>;
  });
}

function Bubble({ action }: { action: AgentAction }) {
  const cfg = AGENT_CFG[action.agent] ?? AGENT_CFG.system;
  const type = TYPE_CFG[action.type] ?? TYPE_CFG.thinking;
  const isUser = action.agent === "user";
  const isSystem = action.agent === "system";

  /* ── System row (centered) ── */
  if (isSystem) {
    return (
      <div
        className="anim-fade-up"
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "4px 20px",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <cfg.Icon size={12} color={cfg.color} />
            <span
              style={{
                fontSize: "0.7rem",
                color: cfg.color,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              {action.agentName?.toUpperCase()}
            </span>
            <span className={`badge ${type.cls}`}>{type.label}</span>
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-2)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
            }}
          >
            {renderContent(action.content)}
          </p>
        </div>
      </div>
    );
  }

  /* ── Chat bubble ── */
  return (
    <div
      className="anim-fade-up"
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
        padding: "4px 20px",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-sm)",
          background: isUser ? "var(--blue-glow)" : "rgba(255,255,255,0.04)",
          border:
            "1px solid " + (isUser ? "var(--blue-border)" : "var(--border)"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <cfg.Icon size={13} color={cfg.color} />
      </div>

      <div
        style={{
          maxWidth: "76%",
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
          gap: 4,
        }}
      >
        {/* Meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!isUser && (
            <span
              style={{ fontSize: "0.7rem", fontWeight: 600, color: cfg.color }}
            >
              {action.agentName}
            </span>
          )}
          <span className={`badge ${type.cls}`}>{type.label}</span>
          <span
            style={{
              fontSize: "0.65rem",
              color: "var(--text-4)",
              fontFamily: "var(--mono)",
            }}
          >
            {new Date(action.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Bubble */}
        <div
          style={{
            background: isUser
              ? "var(--blue-glow)"
              : action.agent === "seller"
                ? "rgba(251,191,36,0.06)"
                : action.type === "transaction"
                  ? "rgba(43,127,255,0.06)"
                  : action.type === "result"
                    ? "rgba(46,240,161,0.06)"
                    : "var(--bg-card)",
            border:
              "1px solid " +
              (isUser
                ? "var(--blue-border)"
                : action.agent === "seller"
                  ? "rgba(251,191,36,0.18)"
                  : action.type === "transaction"
                    ? "var(--blue-border)"
                    : action.type === "result"
                      ? "var(--green-border)"
                      : "var(--border)"),
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            fontSize: "0.8375rem",
            color: "var(--text-2)",
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            overflowWrap: "anywhere",
          }}
        >
          {renderContent(action.content)}
          {action.data?.price !== undefined && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ArrowRight size={11} color="var(--text-4)" />
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                Price
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--blue-bright)",
                }}
              >
                {String(action.data.price)} ALGO
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatInterface({ actions }: ChatInterfaceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions.length]);

  if (actions.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          className="anim-fade-up"
          style={{
            textAlign: "center",
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Icon */}
          <div
            className="anim-glow-pulse"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--blue-glow)",
              border: "1px solid var(--blue-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={26} color="var(--blue-bright)" className="anim-float" />
          </div>

          <div>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--text-1)",
                marginBottom: 8,
              }}
            >
              AI Buyer Agent
            </h2>
            <p
              style={{
                fontSize: "0.8375rem",
                color: "var(--text-3)",
                lineHeight: 1.7,
              }}
            >
              Describe what you want to buy. The agent will discover services,
              compare options, negotiate the best price, and execute payment on
              Algorand.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {[
              "Auto-Discover",
              "AI Negotiation",
              "On-Chain Payment",
              "ZK Verified",
            ].map((tag) => (
              <span key={tag} className="badge badge-white">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        paddingBlock: 12,
        minHeight: 0,
      }}
    >
      {actions.map((a) => (
        <Bubble key={a.id} action={a} />
      ))}
      <div ref={ref} />
    </div>
  );
}
