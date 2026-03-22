"use client";

import { useState, useRef, useEffect } from "react";

interface IntentInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
  phase: string;
}

const SUGGESTIONS = [
  "Buy cloud storage under 1 ALGO",
  "Find cheapest API gateway",
  "Get GPU compute for ML training",
  "Buy managed hosting under 1 ALGO",
];

export function IntentInput({ onSubmit, isLoading, phase }: IntentInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === "idle" || phase === "completed") {
      inputRef.current?.focus();
    }
  }, [phase]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    setMessage("");
  }

  function handleSuggestion(text: string) {
    if (isLoading) return;
    onSubmit(text);
  }

  const isDisabled =
    isLoading || !["idle", "completed", "error"].includes(phase);

  return (
    <div className="border-t border-zinc-800/60 glass">
      {phase === "idle" && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-thin">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700/50 hover:text-zinc-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="px-4 py-3 flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            isDisabled
              ? "Agent is working..."
              : "Describe what you want to buy (e.g., 'Buy cloud storage under 100 ALGO')"
          }
          disabled={isDisabled}
          className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isDisabled || !message.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Working
            </span>
          ) : (
            "Send"
          )}
        </button>
      </form>
    </div>
  );
}
