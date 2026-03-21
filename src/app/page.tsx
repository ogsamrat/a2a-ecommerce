import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Blocks,
  CircleDollarSign,
  Search,
  Store,
  Wallet,
} from "lucide-react";

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
          <Link href="/chat" className="btn-outline">
            Start Agent Chat
          </Link>
          <Link href="/marketplace" className="btn-outline">
            Explore Marketplace
          </Link>
        </div>

        <div className="chat-log" style={{ marginTop: "1rem" }}>
          <p>
            <span>&gt; ON-CHAIN FLOW:</span> Listings are stored as Algorand
            transaction notes and discovered from indexed chain data.
          </p>
          <p>
            <span>&gt; NEGOTIATION:</span> Buyer and seller agents iterate on
            offers until the best acceptable price is reached.
          </p>
          <p>
            <span>&gt; SETTLEMENT:</span> Final payment is signed by wallet and
            confirmed on-chain with transaction traceability.
          </p>
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

      <section className="section-grid no-skew">
        <article className="cyber-card timeline-panel">
          <div className="section-head">
            <Brain size={18} />
            <h3>How It Works</h3>
          </div>
          <ul>
            <li>
              <strong>1. Intent Parsing</strong>
              <p>
                Buyer prompts are translated into structured intent with budget
                and service signals.
              </p>
            </li>
            <li>
              <strong>2. On-Chain Discovery</strong>
              <p>
                The agent queries indexed listing notes and filters by dynamic
                type and budget.
              </p>
            </li>
            <li>
              <strong>3. Negotiation & Selection</strong>
              <p>
                Multi-round negotiation compares offers and chooses the best
                accepted deal.
              </p>
            </li>
            <li>
              <strong>4. Wallet Settlement</strong>
              <p>
                Payment is prepared server-side, signed in-wallet, and submitted
                with explorer traceability.
              </p>
            </li>
          </ul>
        </article>

        <article className="cyber-card terminal-panel">
          <div className="section-head">
            <Blocks size={18} />
            <h3>On-Chain Details</h3>
          </div>
          <div className="chat-log">
            <p>
              <span>&gt; LISTING RECORD</span> Type, service, price,
              description, timestamp, and seller identity are embedded in signed
              transaction notes.
            </p>
            <p>
              <span>&gt; DISCOVERY PATH</span> Marketplace and chat fetch real
              indexed chain notes only, then apply dynamic filters by type and
              budget.
            </p>
            <p>
              <span>&gt; TRUST SIGNALS</span> Reputation scoring is resolved
              from contract-backed data and shown alongside discovered listings.
            </p>
            <p>
              <span>&gt; DEAL EXECUTION</span> Negotiated outcomes are paid with
              wallet-signed transfers and confirmed with immutable transaction
              IDs.
            </p>
            <p>
              <span>&gt; END RESULT</span> A fully auditable commerce trail from
              listing publication to negotiated settlement on-chain.
            </p>
          </div>
        </article>
      </section>

      <section className="cyber-card">
        <div className="section-head">
          <CircleDollarSign size={18} />
          <h3>Quick Start</h3>
        </div>
        <div className="product-grid" style={{ marginTop: "0" }}>
          <article className="cyber-card product-card">
            <div className="product-top">
              <Wallet size={16} />
              <span>STEP 1</span>
            </div>
            <h4>Connect Wallet</h4>
            <p>Use Pera, Defly, or Lute from the sidebar wallet control.</p>
          </article>

          <article className="cyber-card product-card">
            <div className="product-top">
              <Store size={16} />
              <span>STEP 2</span>
            </div>
            <h4>Create Listings</h4>
            <p>
              Publish service listings with any type (example: ai-compute-gpu,
              observability, storage-archive).
            </p>
          </article>

          <article className="cyber-card product-card">
            <div className="product-top">
              <Bot size={16} />
              <span>STEP 3</span>
            </div>
            <h4>Run Agent Flow</h4>
            <p>
              Use chat to discover listings, negotiate offers, and execute
              payment with signed transactions.
            </p>
          </article>
        </div>

        <div className="hero-actions">
          <Link href="/sell" className="btn-neon">
            Create a Listing
            <ArrowRight size={16} />
          </Link>
          <Link href="/chat" className="btn-outline">
            Launch Agent Chat
          </Link>
        </div>
      </section>
    </main>
  );
}
