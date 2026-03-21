"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { ChatSection } from "@/components/chat-section";

export default function ChatPage() {
  return (
    <DashboardShell
      title="Agent Chat"
      subtitle="Describe what to buy and let the agent discover, compare, negotiate, and execute the purchase."
      fixedHeight
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          minHeight: 0, // allows it to shrink instead of overflowing
        }}
      >
        <ChatSection />
      </div>
    </DashboardShell>
  );
}
