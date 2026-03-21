"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { ChatSection } from "@/components/chat-section";

export default function ChatPage() {
  return (
    <DashboardShell
      title="Agent Chat"
      subtitle="Describe what to buy and let the agent discover, compare, negotiate, and execute the purchase."
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          height: "calc(100vh - 220px)", minHeight: "500px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <ChatSection />
      </div>
    </DashboardShell>
  );
}
