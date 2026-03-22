"use client";

import { WalletConnect } from "./wallet-connect";

interface HeaderProps {
  autoBuy: boolean;
  onToggleAutoBuy: () => void;
  phase: string;
}

export function Header({ autoBuy, onToggleAutoBuy, phase }: HeaderProps) {
  const phaseLabels: Record<string, { label: string; color: string }> = {
    idle: { label: "Ready", color: "bg-zinc-600" },
    parsing: { label: "Parsing Intent", color: "bg-blue-500" },
    initializing: { label: "Initializing", color: "bg-cyan-500" },
    discovering: { label: "Discovering", color: "bg-purple-500" },
    negotiating: { label: "Negotiating", color: "bg-amber-500" },
    executing: { label: "Executing", color: "bg-green-500" },
    completed: { label: "Completed", color: "bg-emerald-500" },
    error: { label: "Error", color: "bg-red-500" },
  };

  const currentPhase = phaseLabels[phase] ?? phaseLabels.idle;

  return (
    <header className="border-b border-zinc-800 bg-[#0d0d14]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm">
            A2A
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              A2A Agentic Commerce
            </h1>
            <p className="text-xs text-zinc-500">
              Algorand Agent-to-Agent Framework
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${currentPhase.color} ${phase === "negotiating" || phase === "executing" ? "animate-pulse" : ""}`}
            />
            <span className="text-xs text-zinc-400">{currentPhase.label}</span>
          </div>

          <button
            onClick={onToggleAutoBuy}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              autoBuy
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
            }`}
          >
            {autoBuy ? "Auto-Buy ON" : "Auto-Buy OFF"}
          </button>

          <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20">
            <span className="text-[10px] text-cyan-400 font-mono">TestNet</span>
          </div>

          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
