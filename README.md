<div align="center">

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/A2A-Agentic_Commerce-white?style=for-the-badge&labelColor=000000">
  <img src="https://img.shields.io/badge/A2A-Agentic_Commerce-000000?style=for-the-badge&labelColor=white" alt="A2A" />
</picture>

<br/><br/>

# Autonomous Agents. On-Chain Verification. Real Payments.

<br/>

AI agents autonomously discover services on the Algorand blockchain, negotiate prices with LLMs,<br/>
execute payments through the x402 protocol, verify sellers via on-chain ZK commitments,<br/>
and deliver encrypted credentials to buyers — all without a single human click.<br/>
**Zero intervention. Real credentials. On-chain everything.**

<br/>

<p>
  <a href="https://lora.algokit.io/testnet/application/757481776"><img src="https://img.shields.io/badge/ZKCommitment-757481776-A855F7?style=for-the-badge&logo=algorand&logoColor=white&labelColor=1a1a2e" alt="ZK Contract" /></a>
  &nbsp;&nbsp;
  <a href="https://lora.algokit.io/testnet/application/757478982"><img src="https://img.shields.io/badge/AgentReputation-757478982-22C55E?style=for-the-badge&logo=algorand&logoColor=white&labelColor=1a1a2e" alt="Reputation Contract" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/x402-Payment_Protocol-FF6B00?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/ZK-On--Chain_SHA--256-A855F7?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/Vault-Agent_Auto--Sign-10B981?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/Wallets-Pera_·_Defly_·_Lute-3B82F6?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/AI-Groq_Llama_3.3-F97316?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/Discovery-Algorand_Indexer-0D9488?style=flat-square&labelColor=2d2d2d" />
  <img src="https://img.shields.io/badge/Contracts-PuyaTs_→_TEAL-6366F1?style=flat-square&labelColor=2d2d2d" />
</p>

<br/>

---

</div>

<br/>

## Overview

Every digital purchase today — cloud storage, API access, compute, streaming accounts — requires a human to search, compare, and pay. **A2A Agentic Commerce** removes that bottleneck entirely. Fund the Vault, type what you want, and autonomous agents handle discovery, verification, negotiation, payment, and credential delivery end-to-end.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#24292f', 'primaryTextColor': '#24292f', 'primaryBorderColor': '#d1d5db', 'lineColor': '#6b7280', 'secondaryColor': '#f6f8fa', 'tertiaryColor': '#f6f8fa', 'background': '#ffffff', 'mainBkg': '#f6f8fa', 'nodeBorder': '#d1d5db', 'clusterBkg': '#f6f8fa', 'clusterBorder': '#d1d5db', 'titleColor': '#24292f', 'edgeLabelBackground': '#ffffff', 'textColor': '#24292f'}}}%%

flowchart LR
    A["<b>User Intent</b><br/><i>Natural language</i>"]:::node
    B["<b>AI Parse</b><br/><i>Groq Llama 3.3</i>"]:::node
    C["<b>Discover</b><br/><i>Algorand Indexer</i>"]:::node
    D["<b>ZK Verify</b><br/><i>On-chain SHA-256</i>"]:::accent
    E["<b>Negotiate</b><br/><i>Reputation-aware</i>"]:::node
    F["<b>Vault Pay</b><br/><i>x402 Auto-Sign</i>"]:::accent
    G["<b>Credentials</b><br/><i>Encrypted delivery</i>"]:::accent

    A --> B --> C --> D --> E --> F --> G

    classDef node fill:#f6f8fa,stroke:#d1d5db,color:#24292f,font-size:13px
    classDef accent fill:#24292f,stroke:#24292f,color:#ffffff,font-size:13px
```

<br/>

---

<br/>

## What Makes This Different

<table>
<tr>
<td width="20%" align="center">

**x402 Protocol**

Full x402 HTTP payment integration. Agents pay for credentials via 402 responses — signless, on-chain verified, no external facilitator dependency. Payment proof checked directly against the Algorand ledger.

</td>
<td width="20%" align="center">

**Agent Vault**

Fund once, sit back. The Vault wallet auto-signs payments, reputation updates, and ZK verifications on behalf of AI agents — zero wallet popups. Fully autonomous commerce.

</td>
<td width="20%" align="center">

**On-Chain ZK**

SHA-256 commit-reveal-verify runs inside the AVM via a [deployed contract](https://lora.algokit.io/testnet/application/757481776). The blockchain enforces the proof, not client JavaScript.

</td>
<td width="20%" align="center">

**Wallet-Native**

Pera, Defly, Lute. Server builds unsigned txns, wallet signs client-side. Private keys never touch the server. Or skip wallets entirely — let the Vault handle it.

</td>
<td width="20%" align="center">

**Encrypted Credentials**

Sellers provide username + password when listing. AES-256-GCM encrypted at rest. Delivered to buyers only after x402 payment proof is verified on-chain.

</td>
</tr>
</table>

<br/>

---

<br/>

## Agent Vault — Autonomous Payments

The Vault is the key to fully autonomous agent commerce. It's a server-managed wallet that AI agents auto-sign from — users fund it once, and agents handle everything from there. No popups, no approvals, no friction.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#24292f', 'actorBorder': '#24292f', 'actorTextColor': '#ffffff', 'actorLineColor': '#6b7280', 'signalColor': '#24292f', 'signalTextColor': '#24292f', 'noteBkgColor': '#f6f8fa', 'noteBorderColor': '#d1d5db', 'noteTextColor': '#24292f', 'activationBorderColor': '#d1d5db', 'activationBkgColor': '#f6f8fa', 'sequenceNumberColor': '#ffffff', 'background': '#ffffff', 'mainBkg': '#ffffff'}}}%%

sequenceDiagram
    participant U as User
    participant V as Vault Wallet
    participant AI as AI Agent
    participant A as Algorand
    participant R as Reputation Contract

    U->>V: Fund vault (one-time)

    rect rgba(0, 0, 0, 0.03)
        Note over AI: User types "Buy Netflix under 0.5 ALGO"
        AI->>A: Discover → Verify → Negotiate
    end

    rect rgba(0, 0, 0, 0.05)
        Note over V,A: Auto-Sign Payment (zero popups)
        V->>A: sendRawTransaction (vault key)
        A-->>V: txId + confirmedRound
    end

    rect rgba(0, 0, 0, 0.03)
        Note over V,R: Auto-Sign Reputation Update
        V->>R: submitFeedback(seller, 85)
        R-->>V: Reputation updated on-chain
    end

    V-->>U: ✓ Credentials delivered
```

<br/>

| Mode                  | How it works                           | Wallet popup? |
| :-------------------- | :------------------------------------- | :-----------: |
| **Vault (preferred)** | Server auto-signs with vault key       |    **No**     |
| **Wallet**            | Pera / Defly / Lute signs client-side  |      Yes      |
| **Server-side**       | Uses `AVM_PRIVATE_KEY` (signless x402) |    **No**     |

> Payment execution priority: **Vault → Wallet → Server-side**. If the Vault is funded, agents always auto-sign.

<br/>

---

<br/>

## Live Smart Contracts

> Both contracts are deployed and actively used on Algorand TestNet. Every purchase triggers real-time transactions — ZK verification and reputation updates hit the chain with every deal.

<br/>

<table>
<tr>
<td width="50%">

### [`ZKCommitment`](https://lora.algokit.io/testnet/application/757481776) &nbsp; `App 757481776`

On-chain commit-reveal-verify scheme. The AVM's native `sha256` opcode recomputes hashes and asserts correctness — trustless verification enforced at the protocol level. Used in real-time during negotiations.

```
commit(hash)            → Store SHA-256 hash in BoxMap
reveal(hash, preimage)  → AVM runs sha256(preimage), asserts match
getStatus(hash)         → 0: not found | 1: committed | 2: verified
```

<sub>
<a href="contracts/ZKCommitment.algo.ts">View Source</a> · <a href="contracts/artifacts/zk_commitment/ZKCommitment.approval.teal">View TEAL</a> · <a href="https://lora.algokit.io/testnet/application/757481776">Explorer ↗</a>
</sub>

</td>
<td width="50%">

### [`AgentReputation`](https://lora.algokit.io/testnet/application/757478982) &nbsp; `App 757478982`

ERC-8004 inspired reputation registry. Tracks agent scores, feedback counts, and active status in BoxMap storage. Updated in real-time after every successful purchase — the Vault auto-signs feedback transactions.

```
registerAgent()                      → Create agent profile on-chain
submitFeedback(agent: address, score) → Submit 0–100 rating (ABI: address type)
getReputation(agent)                  → avg(totalScore / feedbackCount) → 0–100
```

<sub>
<a href="contracts/AgentReputation.algo.ts">View Source</a> · <a href="contracts/artifacts/agent_reputation/AgentReputation.approval.teal">View TEAL</a> · <a href="https://lora.algokit.io/testnet/application/757478982">Explorer ↗</a>
</sub>

</td>
</tr>
</table>

<br/>

---

<br/>

## x402 Payment Protocol

Full integration with the [x402 HTTP payment standard](https://x402.goplausible.xyz/) — developed by Coinbase, extended to Algorand by GoPlausible. This is how autonomous agents pay for service credentials: HTTP-native, payment verified directly on-chain, credentials delivered only after proof verification.

<br/>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#24292f', 'actorBorder': '#24292f', 'actorTextColor': '#ffffff', 'actorLineColor': '#6b7280', 'signalColor': '#24292f', 'signalTextColor': '#24292f', 'noteBkgColor': '#f6f8fa', 'noteBorderColor': '#d1d5db', 'noteTextColor': '#24292f', 'activationBorderColor': '#d1d5db', 'activationBkgColor': '#f6f8fa', 'sequenceNumberColor': '#ffffff', 'labelBoxBkgColor': '#f6f8fa', 'labelBoxBorderColor': '#d1d5db', 'labelTextColor': '#24292f', 'loopTextColor': '#24292f', 'background': '#ffffff', 'mainBkg': '#ffffff'}}}%%

sequenceDiagram
    participant C as Buyer Agent
    participant V as Vault / Wallet
    participant P as /api/products/{txId}
    participant A as Algorand

    C->>V: Execute payment (auto-sign or wallet)

    rect rgba(0, 0, 0, 0.03)
        Note over V: Vault auto-signs — zero popup<br/>Wallet signs — user approval
        V->>A: sendRawTransaction
        A-->>V: txId + confirmedRound
    end

    C->>P: GET /api/products/{listingTxId}?proof={paymentTxId}&amount={negotiated}

    rect rgba(0, 0, 0, 0.05)
        Note over P,A: On-chain payment proof verification
        P->>A: pendingTransactionInfo(paymentTxId)
        A-->>P: receiver + amount + confirmedRound
        Note over P: Verify receiver = seller ✓<br/>Verify amount ≥ negotiated price ✓
    end

    P-->>C: 200 OK + decrypted credentials {username, password, notes}
```

<br/>

| Package           | What It Does                                                                              |
| :---------------- | :---------------------------------------------------------------------------------------- |
| `@x402-avm/core`  | Client, server, and facilitator primitives                                                |
| `@x402-avm/avm`   | Algorand exact payment scheme, CAIP-2 network identifiers                                 |
| `@x402-avm/fetch` | `wrapFetchWithPayment()` — transparently handles 402 responses                            |
| `@x402-avm/next`  | Next.js App Router integration (`withX402`, `paymentProxyFromConfig`)                     |
| `src/lib/x402.ts` | On-chain payment proof verifier — algosdk v3 compatible, multi-format receiver extraction |

<br/>

---

<br/>

## On-Chain ZK Verification

The commitment scheme is **enforced by the blockchain**, not by client code. The AVM executes `sha256` natively inside the [`ZKCommitment`](https://lora.algokit.io/testnet/application/757481776) contract. During negotiations, the buyer agent runs a **two-tier verification**: local preimage check first, then on-chain BoxMap lookup against the deployed contract.

<br/>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#24292f', 'actorBorder': '#24292f', 'actorTextColor': '#ffffff', 'actorLineColor': '#6b7280', 'signalColor': '#24292f', 'signalTextColor': '#24292f', 'noteBkgColor': '#f6f8fa', 'noteBorderColor': '#d1d5db', 'noteTextColor': '#24292f', 'activationBorderColor': '#d1d5db', 'activationBkgColor': '#f6f8fa', 'sequenceNumberColor': '#ffffff', 'labelBoxBkgColor': '#f6f8fa', 'labelBoxBorderColor': '#d1d5db', 'labelTextColor': '#24292f', 'loopTextColor': '#24292f', 'background': '#ffffff', 'mainBkg': '#ffffff'}}}%%

sequenceDiagram
    autonumber
    participant S as Seller
    participant ZC as ZKCommitment Contract
    participant BC as Algorand
    participant I as Indexer
    participant B as Buyer Agent

    rect rgba(0, 0, 0, 0.03)
        Note over S: Generate secret + compute SHA-256 hash
        S->>S: secret = randomBytes(32)
        S->>S: hash = SHA-256(secret | seller | price | caps)
    end

    rect rgba(0, 0, 0, 0.05)
        Note over S,ZC: On-Chain Commit
        S->>BC: Post listing — 0-ALGO txn with JSON note + hash
        S->>ZC: commit(hash)
        ZC-->>ZC: Stored in BoxMap
    end

    rect rgba(0, 0, 0, 0.03)
        Note over I,B: Discovery
        B->>I: searchForTransactions(notePrefix, sellerAddr)
        I-->>B: Matched listings + commitment hashes
    end

    rect rgba(0, 0, 0, 0.05)
        Note over B,ZC: Two-Tier Verification
        B->>B: Tier 1 — Local preimage recompute
        B->>ZC: Tier 2 — getStatus(hash) via BoxMap lookup
        ZC-->>B: Status 1 (committed) or 2 (verified)
    end
```

<br/>

| Property      | Guarantee                                                              |
| :------------ | :--------------------------------------------------------------------- |
| **Binding**   | Seller cannot change claims post-commit — SHA-256 collision resistance |
| **Hiding**    | On-chain hash reveals nothing without the 32-byte random nonce         |
| **Trustless** | Verification runs inside the AVM, not trusted client code              |

<br/>

---

<br/>

## Wallet Integration

Three modes of operation. Server prepares unsigned transactions. Wallet signs client-side. Or skip the wallet entirely and let the Vault handle it.

<br/>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#24292f', 'actorBorder': '#24292f', 'actorTextColor': '#ffffff', 'actorLineColor': '#6b7280', 'signalColor': '#24292f', 'signalTextColor': '#24292f', 'noteBkgColor': '#f6f8fa', 'noteBorderColor': '#d1d5db', 'noteTextColor': '#24292f', 'activationBorderColor': '#d1d5db', 'activationBkgColor': '#f6f8fa', 'sequenceNumberColor': '#ffffff', 'labelBoxBkgColor': '#f6f8fa', 'labelBoxBorderColor': '#d1d5db', 'labelTextColor': '#24292f', 'loopTextColor': '#24292f', 'background': '#ffffff', 'mainBkg': '#ffffff'}}}%%

sequenceDiagram
    participant U as User
    participant W as Wallet (Pera / Defly / Lute)
    participant V as Vault (Auto-Sign)
    participant S as API Server
    participant A as Algorand

    alt Vault Funded
        U->>S: Execute deal
        S->>V: Auto-sign payment + reputation
        V->>A: sendRawTransaction (no popup)
        A-->>U: txId + credentials
    else Wallet Connected
        U->>W: Connect wallet
        U->>S: POST /api/wallet/prepare-payment
        S-->>U: Unsigned transaction (base64)
        U->>W: Sign transaction
        W-->>U: Signed transaction
        U->>S: POST /api/wallet/submit
        S->>A: sendRawTransaction
        A-->>U: txId + credentials
    end
```

<br/>

| Wallet                              | Type              | Integration                        |
| :---------------------------------- | :---------------- | :--------------------------------- |
| **[Pera](https://perawallet.app/)** | Mobile + Web      | Most popular Algorand wallet       |
| **[Defly](https://defly.app/)**     | Mobile            | DeFi-focused, portfolio tracking   |
| **[Lute](https://lute.app/)**       | Browser extension | Desktop-first experience           |
| **Vault**                           | Server-side       | Zero-popup autonomous agent wallet |

<sub>Powered by <code>@txnlab/use-wallet-react</code> v4</sub>

<br/>

---

<br/>

## Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#24292f', 'primaryTextColor': '#24292f', 'primaryBorderColor': '#d1d5db', 'lineColor': '#6b7280', 'secondaryColor': '#f6f8fa', 'tertiaryColor': '#ffffff', 'background': '#ffffff', 'mainBkg': '#f6f8fa', 'nodeBorder': '#d1d5db', 'clusterBkg': '#f6f8fa', 'clusterBorder': '#d1d5db', 'titleColor': '#24292f', 'edgeLabelBackground': '#ffffff', 'textColor': '#24292f'}}}%%

graph TD
    A["User Intent"]:::dark --> B

    subgraph AI [" Groq Cloud "]
        B["Llama 3.3 70B — parseIntent"]:::light
        F["Llama 3.3 70B — negotiate"]:::light
    end

    B --> C

    subgraph CHAIN [" Algorand TestNet "]
        G["Algod"]:::light
        H["Indexer"]:::light
        I["On-Chain Listings"]:::light
        ZK["ZKCommitment — 757481776"]:::dark
        REP["AgentReputation — 757478982"]:::dark
        G --- I
        G --- ZK
        G --- REP
        H --> I
    end

    subgraph X402 [" x402 Payment Layer "]
        P["Middleware — 402 Required"]:::mid
        Q["On-Chain Proof Verifier"]:::mid
        P --> Q --> G
    end

    subgraph AGENTS [" Agent Runtime "]
        C["Buyer Agent — Indexer Discovery"]:::light
        D["ZK Verifier — Two-Tier"]:::mid
        E["Negotiation — offer / counter / accept"]:::light
        K["Payment Executor"]:::light
    end

    subgraph VAULT [" Agent Vault "]
        V["Auto-Sign Wallet"]:::dark
    end

    subgraph WALLET [" User Wallet "]
        W["Pera / Defly / Lute"]:::mid
    end

    H --> C --> D --> E
    E <--> F
    E --> K --> V
    K -.-> W
    V --> G
    W -.-> G
    K --> M["Confirmed — txId + credentials"]:::dark

    classDef dark fill:#24292f,stroke:#24292f,color:#ffffff,font-weight:bold
    classDef mid fill:#e5e7eb,stroke:#9ca3af,color:#24292f,font-weight:bold
    classDef light fill:#f6f8fa,stroke:#d1d5db,color:#24292f
```

<br/>

---

<br/>

## Pipeline

| #   | Stage                   | Description                                                                                                                                      |
| :-- | :---------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Connect**             | Initialize Algorand client (TestNet via Algonode)                                                                                                |
| 2   | **Post Listings**       | Sellers publish 0-ALGO self-txns with JSON notes + SHA-256 commitment + credential metadata                                                      |
| 3   | **ZK Commit**           | Commitment hashes registered on [`ZKCommitment`](https://lora.algokit.io/testnet/application/757481776) contract BoxMap                          |
| 4   | **AI Intent**           | Groq Llama 3.3 70B parses natural language → structured intent with search terms and product name preservation                                   |
| 5   | **Indexer Discovery**   | Query Algorand Indexer by `notePrefix` + `minRound` (last ~2 days) — keyword + description matching with fallback search                         |
| 6   | **ZK Verify**           | Two-tier verification: local preimage recompute + on-chain BoxMap lookup via `verifyZKOnChain()`                                                 |
| 7   | **Negotiate**           | Multi-agent parallel negotiation (`max 4` workers) with reputation-weighted concession logic and early-stop when a strong winning score is found |
| 8   | **Payment**             | Vault auto-sign (preferred) → Wallet sign → Server-side signless — payment confirmed on-chain                                                    |
| 9   | **Credential Delivery** | Payment TX as x402 proof → `/api/products/{txId}?proof=&amount=` → on-chain verification → AES-256-GCM decrypt → credentials delivered           |
| 10  | **Reputation Update**   | Auto-signed feedback transaction to `AgentReputation` contract — leaderboard updates in real-time                                                |

<br/>

---

<br/>

## Parallel Negotiation + Early-Stop Policy

Negotiation now runs with a coordinator and bounded parallel workers instead of a purely sequential seller loop.

- Up to **4 seller negotiations** can run concurrently.
- Each worker has a timeout guard (default **20s**) so slow sellers do not block the whole run.
- When an accepted deal reaches a strong score (default threshold **0.85**), the coordinator **stops dispatching** remaining listings.
- Action logs include coordinator events (worker start, failures/timeouts, early-stop trigger, skipped count).

**Deal scoring** remains: `60% discount + 40% reputation`.

<br/>

---

<br/>

## Tech Stack

| Technology                                       | Purpose                                                                      |
| :----------------------------------------------- | :--------------------------------------------------------------------------- |
| **Algorand TestNet**                             | Blockchain — listings, payments, ZK verification, reputation                 |
| **PuyaTs → TEAL**                                | Smart contract compilation (Algorand TypeScript)                             |
| **x402-avm** (`core` · `avm` · `fetch` · `next`) | HTTP 402 payment protocol, on-chain proof verification                       |
| **Agent Vault**                                  | Server-side auto-sign wallet for fully autonomous agent operations           |
| **Pera · Defly · Lute**                          | Wallet authentication via `use-wallet` v4                                    |
| **Groq Llama 3.3 70B**                           | Intent parsing with search term extraction + reputation-aware negotiation AI |
| **Algorand Indexer**                             | On-chain listing discovery with `minRound` scoping + keyword fallback        |
| **AES-256-GCM**                                  | At-rest encryption of seller credentials (`src/lib/credentials.ts`)          |
| **algosdk v3 · algokit-utils v8**                | Transaction building, raw signing, account management                        |
| **Next.js 15 · React 19 · Tailwind 4**           | Cyberpunk one-page frontend + 19 API routes                                  |
| **TypeScript 5.8**                               | End-to-end strict type safety                                                |

<br/>

---

<br/>

## Quick Start

**Prerequisites**: Node.js 18+ · AlgoKit CLI (`pipx install algokit`)

```bash
git clone https://github.com/ogsamrat/a2a-ecommerce.git
cd a2a-ecommerce
npm install
cp .env.example .env
```

Configure `.env`:

```env
GROQ_API_KEY=your_key                    # console.groq.com
ALGORAND_NETWORK=testnet
AVM_PRIVATE_KEY=your_base64_key          # Buyer key — signs x402 payments server-side
REPUTATION_APP_ID=757478982
ZK_APP_ID=757481776

# Optional — auto-generated if not set (persisted to .vault-key)
# VAULT_PRIVATE_KEY=your_base64_key
```

> Fund your TestNet buyer account: [lora.algokit.io/testnet/fund](https://lora.algokit.io/testnet/fund)

**Terminal** (full pipeline):

```bash
npx tsx scripts/run.ts "Buy cloud storage under 1 ALGO"
```

**Web app** (cyberpunk UI — vault + marketplace + sell + looker):

```bash
npm run dev
```

**Tests** (parallel negotiation policy + deterministic selection):

```bash
npm test
```

Open [localhost:3000](http://localhost:3000) — connect Pera, fund the Vault, or just start buying.

<br/>

---

<br/>

## API Reference

**19 endpoints** for frontend integration. Full docs with request/response examples in [`API_GUIDE.md`](API_GUIDE.md).

| Category       | Endpoints                                                                       | Auth                   |
| :------------- | :------------------------------------------------------------------------------ | :--------------------- |
| **Vault**      | `/api/vault` (GET info, POST fund/execute/sign)                                 | Server / Wallet        |
| **Wallet**     | `/api/wallet/info` · `prepare-payment` · `submit`                               | Wallet address         |
| **Listings**   | `/api/listings/fetch` · `create` (+ `username` / `password` fields)             | None / Wallet          |
| **Products**   | `/api/products/[txId]` — x402 credential delivery with negotiated price support | On-chain payment proof |
| **Reputation** | `/api/reputation/query` · `register` · `feedback` · `update`                    | None / Wallet / Vault  |
| **Commerce**   | `/api/intent` · `discover` · `negotiate` · `execute` · `init`                   | Server                 |
| **Premium**    | `/api/premium/data` · `analyze`                                                 | x402 payment           |

<br/>

---

<br/>

## Project Structure

```
contracts/
├── ZKCommitment.algo.ts              # On-chain SHA-256 commit/reveal/verify
├── AgentReputation.algo.ts           # ERC-8004 reputation registry
└── artifacts/                        # Compiled TEAL + ARC-56 specs

scripts/
├── run.ts                            # Full A2A pipeline demo
├── deploy-zk.ts                      # Deploy ZKCommitment
└── deploy-reputation.ts              # Deploy AgentReputation

src/app/api/                          # 19 Next.js API routes
├── vault/                            # Vault fund/execute/sign (auto-sign wallet)
├── products/[txId]/                  # x402-protected credential delivery
├── listings/create/                  # Accepts username + password for AES-256-GCM storage
└── ...

src/components/                       # Wallet provider, connect UI, chat, cards
src/lib/
├── blockchain/
│   ├── algorand.ts                   # AlgorandClient + reputation query (0–100 avg)
│   ├── vault.ts                      # Agent Vault — auto-sign wallet with file persistence
│   ├── listings.ts                   # On-chain listing I/O with keyword fallback search
│   ├── zk.ts                         # ZK commitment + on-chain BoxMap verification
│   └── reputation.ts                 # submitFeedback(address,uint64) ABI calls
├── credentials.ts                    # AES-256-GCM store/decrypt for seller credentials
├── x402.ts                           # buildPaymentRequirements + verifyOnChainPayment (v3 compat)
├── agents/                           # Buyer + seller agent logic with search term extraction
├── ai/                               # Groq LLM integration with product name preservation
└── negotiation/                      # Multi-agent parallel negotiation engine + early-stop coordinator + timeout handling
```

<br/>

---

<br/>

## Roadmap

- [x] On-chain service listings (0-ALGO transactions with credential metadata)
- [x] Algorand Indexer discovery — `minRound` scoped + keyword fallback search
- [x] **On-chain ZK** — [`ZKCommitment`](https://lora.algokit.io/testnet/application/757481776) deployed on TestNet with two-tier verification
- [x] **Agent reputation** — [`AgentReputation`](https://lora.algokit.io/testnet/application/757478982) — real-time on-chain updates after every purchase
- [x] **x402 payments** — full protocol integration with on-chain proof verification
- [x] **Agent Vault** — server-side auto-sign wallet, zero popups, file-persisted keys
- [x] **Encrypted credential delivery** — AES-256-GCM, decrypted only after on-chain payment proof with negotiated price support
- [x] **Wallet auth** — Pera · Defly · Lute with hydration-safe SSR
- [x] AI negotiation — Groq Llama 3.3 70B (reputation-aware, search term extraction)
- [x] 19 API endpoints + [`API_GUIDE.md`](API_GUIDE.md) + Vault API
- [x] Full frontend dashboard — Marketplace · Sell · Vault · Looker · Reputation leaderboard · Live contract links
- [x] Multi-agent parallel negotiation
- [ ] MainNet deployment

<br/>

---

<div align="center">

<br/>

**Built on [Algorand](https://algorand.co)** — 3.3s finality · <$0.001 fees · carbon negative

<sub>x402 Protocol &nbsp;·&nbsp; Agent Vault Auto-Sign &nbsp;·&nbsp; On-Chain ZK Verification &nbsp;·&nbsp; Encrypted Credential Delivery &nbsp;·&nbsp; Groq AI &nbsp;·&nbsp; Wallet-Native</sub>

<br/>

</div>
