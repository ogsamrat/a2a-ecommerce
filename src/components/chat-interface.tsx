"use client";

import { useEffect, useRef } from "react";
import { AgentAction } from "@/lib/agents/types";

interface ChatInterfaceProps {
  actions: AgentAction[];
}

function AgentAvatar({ agent }: { agent: AgentAction["agent"] }) {
  const config: Record<string, { bg: string; label: string }> = {
    user: { bg: "bg-blue-600", label: "You" },
    buyer: { bg: "bg-emerald-600", label: "BA" },
    seller: { bg: "bg-amber-600", label: "SA" },
    system: { bg: "bg-purple-600", label: "SYS" },
  };
  const c = config[agent] ?? config.system;
  return (
    <div
      className={`w-8 h-8 rounded-full ${c.bg} flex items-center justify-center text-[10px] font-bold shrink-0`}
    >
      {c.label}
    </div>
  );
}

function TypeBadge({ type }: { type: AgentAction["type"] }) {
  const config: Record<string, { bg: string; text: string }> = {
    thinking: { bg: "bg-zinc-700/50", text: "text-zinc-400" },
    message: { bg: "bg-blue-500/20", text: "text-blue-400" },
    negotiation: { bg: "bg-amber-500/20", text: "text-amber-400" },
    transaction: { bg: "bg-purple-500/20", text: "text-purple-400" },
    result: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  };
  const c = config[type] ?? config.thinking;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}
    >
      {type}
    </span>
  );
}

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ChatBubble({ action }: { action: AgentAction }) {
  const isUser = action.agent === "user";
  const isSystem = action.agent === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 animate-fade-in-up">
        <div className="max-w-lg px-4 py-2 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
          <div className="flex items-center gap-2 mb-1">
            <AgentAvatar agent="system" />
            <span className="text-xs text-zinc-500">{action.agentName}</span>
            <TypeBadge type={action.type} />
          </div>
          <p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed">
            {renderContent(action.content)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-2.5 my-2 animate-fade-in-up ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <AgentAvatar agent={action.agent} />
      <div
        className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-zinc-400">
            {action.agentName}
          </span>
          <TypeBadge type={action.type} />
          <span className="text-[10px] text-zinc-600">
            {new Date(action.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            isUser
              ? "bg-blue-600/20 border border-blue-500/20 text-blue-100"
              : action.agent === "seller"
                ? "bg-amber-500/10 border border-amber-500/15 text-amber-100"
                : action.type === "transaction"
                  ? "bg-purple-500/10 border border-purple-500/15 text-purple-100"
                  : action.type === "result"
                    ? "bg-emerald-500/10 border border-emerald-500/15 text-emerald-100"
                    : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-300"
          }`}
        >
          {renderContent(action.content)}
          {action.data?.price !== undefined && (
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Price
              </span>
              <span className="text-sm font-semibold text-white">
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions.length]);

  if (actions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-5 max-w-lg px-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">
              What do you want to buy?
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-md mx-auto">
              Your buyer agent will search on-chain listings via the Algorand Indexer,
              verify sellers with ZK commitments, negotiate the best price, and execute
              payment — all autonomously.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-3">
            <div className="flex items-center gap-4 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-violet-500" />
                On-Chain ZK
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                x402 Protocol
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                Real Payments
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-blue-500" />
                AI Negotiation
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
      {actions.map((action) => (
        <ChatBubble key={action.id} action={action} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
