"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LayoutDashboard, Search, Store } from "lucide-react";
import { WalletConnect } from "@/components/wallet-connect";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sell", label: "Sell", icon: Store },
  { href: "/marketplace", label: "Marketplace", icon: Search },
  { href: "/chat", label: "Agent Chat", icon: Bot },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <p className="code-tag">AGENTDEX // OPERATOR</p>
        <h1>AGENTDEX</h1>
        <p className="sidebar-copy">
          Autonomous buyer and seller agents with Algorand settlement.
        </p>
      </div>

      <nav className="sidebar-nav" aria-label="Dashboard">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cyber-link ${active ? "is-active" : ""}`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-wallet">
        <WalletConnect />
      </div>

      <div className="status-panel cyber-card terminal-panel">
        <p className="code-tag">SYSTEM STATUS</p>
        <p>
          Network: <span>ONLINE</span>
        </p>
        <p>
          Indexer: <span>READY</span>
        </p>
        <p>
          Agent Mesh: <span>LIVE</span>
        </p>
      </div>
    </aside>
  );
}
