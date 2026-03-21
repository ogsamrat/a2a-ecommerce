"use client";

import { WalletConnect } from "./wallet-connect";
import { Store, ShoppingBag, MessageSquare, Zap } from "lucide-react";

type Tab = "sell" | "marketplace" | "chat";

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "sell", label: "Sell", icon: Store },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { id: "chat", label: "Agent Chat", icon: MessageSquare },
];

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(8, 8, 16, 0.85)",
        borderColor: "var(--border-subtle)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="max-w-screen-xl mx-auto px-5 flex items-center gap-5 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center relative overflow-hidden"
            style={{
              background: "var(--gold-glow)",
              border: "1px solid var(--gold-border)",
            }}
          >
            <Zap
              size={16}
              className="animate-glow-breathe"
              style={{ color: "var(--gold-vivid)" }}
            />
          </div>
          <div>
            <span
              className="text-sm font-bold tracking-tight"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              AgentDEX
            </span>
            <span
              className="hidden sm:inline text-[10px] ml-2 px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "rgba(45,212,191,0.1)",
                color: "var(--teal)",
                border: "1px solid rgba(45,212,191,0.2)",
              }}
            >
              TestNet
            </span>
          </div>
        </div>

        {/* Tab nav */}
        <nav className="flex-1 flex items-center justify-center">
          <div
            className="flex items-center gap-1 rounded-xl px-1.5 py-1.5"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: active ? "var(--gold-vivid)" : "transparent",
                    color: active ? "#080810" : "var(--text-secondary)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Wallet */}
        <div className="shrink-0">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
