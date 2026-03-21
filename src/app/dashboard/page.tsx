import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  Radar,
  Search,
  Store,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

const cards = [
  {
    title: "List Products",
    copy: "Create on-chain listings that seller agents can publish and buyer agents can discover.",
    href: "/sell",
    icon: Store,
  },
  {
    title: "Discover Marketplace",
    copy: "Browse all available products with live filters for service type and budget.",
    href: "/marketplace",
    icon: Search,
  },
  {
    title: "Run Agent Chat",
    copy: "Buyer specifies intent, agent compares listings, negotiates best deal, and buys.",
    href: "/chat",
    icon: Bot,
  },
  {
    title: "Observer",
    copy: "Monitor on-chain listing activity, seller density, type distribution, and latest rounds.",
    href: "/observer",
    icon: Radar,
  },
];

export default function DashboardPage() {
  return (
    <DashboardShell
      title="Dashboard"
      subtitle="Control center for listing, discovery, negotiation, and settlement."
    >
      <section className="grid-cards">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="cyber-card product-card">
              <div className="product-top">
                <Icon size={18} />
                <span>READY</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
              <Link href={card.href} className="btn-outline">
                Open
                <ArrowRight size={16} />
              </Link>
            </article>
          );
        })}
      </section>

      <section className="cyber-card terminal-panel">
        <div className="section-head">
          <CircleDollarSign size={18} />
          <h3>Execution Pipeline</h3>
        </div>
        <ul className="timeline-list">
          <li>Buyer enters intent in chat</li>
          <li>Indexer discovery finds matching on-chain listings</li>
          <li>Agent compares, ranks, and negotiates</li>
          <li>Wallet signs and submits final purchase transaction</li>
        </ul>
      </section>
    </DashboardShell>
  );
}
