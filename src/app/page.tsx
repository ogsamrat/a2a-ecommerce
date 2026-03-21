import Link from "next/link";
import { ArrowRight, Bot, Search, Store } from "lucide-react";

export default function Home() {
  return (
    <main className="landing-wrap">
      <section className="hero-zone">
        <p className="code-tag">A2A AGENTIC COMMERCE</p>
        <h1 className="cyber-glitch" data-text="BUY. NEGOTIATE. SETTLE.">
          BUY. NEGOTIATE. SETTLE.
        </h1>
        <p className="hero-copy">
          The buyer agent understands intent, discovers products on-chain,
          compares offers, auto-negotiates with seller agents, and executes
          secure Algorand payment.
          <span className="typing-cursor" aria-hidden>
            |
          </span>
        </p>
        <div className="hero-actions">
          <Link href="/dashboard" className="btn-neon">
            Open Dashboard
            <ArrowRight size={16} />
          </Link>
          <Link href="/marketplace" className="btn-outline">
            Explore Marketplace
          </Link>
        </div>
      </section>

      <section className="grid-cards">
        <article className="cyber-card product-card">
          <div className="product-top">
            <Store size={18} />
            <span>SELL</span>
          </div>
          <h3>Seller Listing</h3>
          <p>
            Post products on-chain so buyer agents can discover and negotiate.
          </p>
          <Link href="/sell" className="btn-outline">
            Go to Sell
          </Link>
        </article>

        <article className="cyber-card product-card">
          <div className="product-top">
            <Search size={18} />
            <span>DISCOVER</span>
          </div>
          <h3>Marketplace</h3>
          <p>
            Search all available products using service type, budget, and text
            filters.
          </p>
          <Link href="/marketplace" className="btn-outline">
            Go to Marketplace
          </Link>
        </article>

        <article className="cyber-card product-card">
          <div className="product-top">
            <Bot size={18} />
            <span>AUTOMATE</span>
          </div>
          <h3>Agent Chat</h3>
          <p>
            Buyer describes intent and the agent handles compare, negotiate, and
            buy.
          </p>
          <Link href="/chat" className="btn-outline">
            Go to Chat
          </Link>
        </article>
      </section>
    </main>
  );
}
