# Execution Plan — Across Senior Solutions Architect Case Study

## 1. High-Level Approach

**The thesis:** This case study is not a coding test. It's a judgment test delivered through code. The evaluators want to see how a Senior Solutions Architect navigates two unfamiliar systems, composes them into a coherent integration, communicates to two different audiences (partner engineers vs. internal product team), and identifies where Across should invest next.

**What we're building:**

A working end-to-end flow: **Fiat USD → Coinbase CDP Onramp (production) → ETH on Base → Across mainnet bridge → ETH on Arbitrum.**

This is the "Onramp → Across → destination chain" pattern from the case study's suggested directions. It demonstrates:
- Composing two real systems (Coinbase + Across) that a partner would actually ship
- Crosschain ETH movement via the Swap API
- Deposit tracking and fill confirmation
- Failure handling at each hop

**What we're delivering (4 artifacts):**

| Deliverable | Format | Audience | Time budget |
|-------------|--------|----------|-------------|
| Working integration | TypeScript repo, runnable scripts | Evaluators (technical) | ~40% of time |
| Partner pitch | Structured doc, 3-6 pages | Coinbase's engineering team (external) | ~25% of time |
| Internal brief | 2-3 pages | Across product/eng team (internal) | ~20% of time |
| Architecture appendix | Diagrams + sequence flows | Both audiences | ~15% of time |

**Strategic framing:** We are the Solutions Architect who just joined Across. Coinbase has agreed to integrate Across into their onramp product so users who buy ETH can land it on any destination chain, not just the chain Coinbase directly supports. Our job is to make that integration real.

---

## 2. Architecture / System Design

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                                │
│                                                                     │
│  Step 1: User initiates     Step 2: Coinbase        Step 3: Across  │
│  purchase in partner app    onramps USD → ETH       bridges ETH     │
│                             on Base                 to Arbitrum      │
│                                                                     │
│  ┌──────────┐   ┌───────────────────┐   ┌─────────────────────┐    │
│  │  Partner  │──▶│  Coinbase Onramp  │──▶│  Across Swap API    │    │
│  │  App/UI   │   │  (production widget)│  │  (mainnet)          │    │
│  └──────────┘   └───────────────────┘   └─────────────────────┘    │
│       │                   │                        │                │
│       │           ETH lands in wallet       ETH arrives on         │
│       │           on Base                   Arbitrum                │
│       │                   │                        │                │
│       │           ┌───────────────┐        ┌──────────────┐        │
│       └──────────▶│ Deposit Track │───────▶│ Fill Confirm │        │
│                   │ (poll status) │        │ (complete)   │        │
│                   └───────────────┘        └──────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

### System Boundaries — Who Owns What

| Concern | Owner | Details |
|---------|-------|---------|
| Fiat collection + KYC | Coinbase | Onramp widget handles payment method, identity verification |
| USD → ETH conversion | Coinbase | Converts fiat to ETH, delivers to user's wallet on origin chain (Base) |
| ETH custody on origin chain | User's wallet | Self-custodial; user signs the bridge transaction |
| Crosschain routing + settlement | Across | Swap API selects mechanism (Intents at this volume), relayer fills on destination |
| Fill confirmation | Across | `/deposit/status` API, polled by partner backend |
| Destination chain delivery | Across relayer network | ETH arrives in user's wallet on Arbitrum |

### State Transitions

```
[INITIATED] User clicks "Buy & Bridge"
     │
     ▼
[ONRAMPING] Coinbase widget open, user completing purchase
     │
     ├── FAIL: user abandons, payment fails → flow ends
     ▼
[ONRAMP_COMPLETE] ETH in wallet on Base
     │
     ▼
[QUOTING] Call Across /swap/approval for bridge quote
     │
     ├── FAIL: quote fails (amount too low, route unavailable) → show error
     ▼
[APPROVING] Execute token approval txns (if needed)
     │
     ├── FAIL: user rejects approval → flow ends
     ▼
[BRIDGING] Execute swap transaction on Base
     │
     ├── FAIL: tx reverts → show error, funds still on origin
     ▼
[PENDING_FILL] Deposit submitted, waiting for relayer fill
     │
     ├── TIMEOUT: fill deadline passes → refund on origin chain
     ▼
[FILLED] ETH delivered on Arbitrum
     │
     ▼
[COMPLETE] User notified, flow done
```

### Key Design Decisions

1. **Swap API, not raw SpokePool deposits.** The Swap API (`/swap/approval`) returns ready-to-execute calldata including approvals. Going lower-level (calling `depositV3` directly via `suggested-fees`) adds complexity with no benefit for this flow.

2. **Sequential execution, not atomic.** The onramp and bridge are two separate transactions. The user must first complete the Coinbase purchase, then sign the bridge transaction. This is inherent to the architecture — Coinbase delivers funds, then Across moves them. A production system would automate step 2 via a backend service that watches for onramp completion and submits the bridge tx.

3. **Polling for fill confirmation.** No webhooks available from Across. We poll `/deposit/status` with exponential backoff. This is fine for a demo; the internal brief will flag it as a scaling concern. On mainnet, fills are fast (~2s) so the polling window is short.

---

## 3. Key Decisions and Tradeoffs

### Decision 1: Coinbase over other partners

**Choice:** Coinbase CDP Onramp (production).
**Tradeoff:** It's the "safe" choice — explicitly named in the case study. A more exotic partner (Bridge.xyz, a hypothetical payments provider) might show more creativity, but risks sandbox access issues and requires evaluator education. Coinbase lets us spend time on architecture and reasoning, not partner onboarding.
**Defense in Q&A:** "Coinbase is the largest onramp provider. If this integration works, it's immediately relevant to Across's growth strategy. The architecture generalizes to any onramp — I'll show that in the appendix."

### Decision 2: Script-based demo over full-stack app

**Choice:** TypeScript scripts (Node.js + viem) that execute each step, with clear console output.
**Tradeoff:** A Next.js app with a UI would look flashier, but risks scope creep and half-finished UX. A well-annotated script proves technical fluency and is actually how a partner engineer would prototype.
**Defense in Q&A:** "In practice, the first thing I'd build with a partner is a working backend script, not a UI. The script proves the integration works. UI comes after the plumbing is validated."

### Decision 3: Mainnet with real money (~$1 ETH)

**Choice:** Live demo on Across mainnet + Coinbase production onramp, using ~$1 of real ETH.
**Why we pivoted from testnet:** Two blockers forced the move: (1) The Across testnet relayer was unreliable — fills were slow or didn't happen, making the demo flaky. (2) The Coinbase Onramp sandbox doesn't deliver real on-chain tokens, so the onramp→bridge flow couldn't be tested end-to-end on testnet. By using mainnet with a small amount (~$1 ETH), we get a fully live, demonstrably working flow — fiat in, ETH on the destination chain out. The cost is trivial and the result is dramatically more convincing than a half-stubbed testnet demo.
**Defense in Q&A:** "I pivoted to mainnet because both the Across testnet relayer and the Coinbase sandbox had limitations that made the end-to-end flow unreliable. For ~$1 of real ETH, I get a demo that actually works — fast fills (~2s), real tokens, real confirmation. That's worth more than a testnet demo that might not fill."

### Decision 4: Production Coinbase Onramp

**Choice:** Use the Coinbase Onramp in production mode with real fiat for a small amount (~$1).
**Why not sandbox:** The Coinbase Onramp sandbox does not deliver real on-chain tokens. It simulates the widget UI flow but no ETH actually arrives in the wallet, which means the bridge step cannot execute. Since we need on-chain tokens to demonstrate the full onramp→bridge flow, production mode is the only option that works end-to-end.
**Tradeoff:** Requires a real payment method and real money. But the amount is trivial (~$1), and the result is a genuinely live demo — fiat enters, ETH arrives on the destination chain.
**Defense in Q&A:** "The Coinbase sandbox doesn't deliver on-chain tokens. To demonstrate a real end-to-end flow, I used production mode with ~$1 of real ETH. The architecture is identical — the only difference is the `mode` parameter in the onramp configuration."

---

## 4. Step-by-Step Execution Plan

### Phase 0: Setup (2 hours)

- [ ] Create wallet (new private key + address)
- [ ] Fund wallet with ~$1 ETH on Base (via Coinbase Onramp or direct transfer)
- [ ] Ensure small amount of ETH on Arbitrum for gas (if needed for testing)
- [ ] Initialize repo: `npm init`, install `viem`, `typescript`, `tsx`
- [ ] Verify Across mainnet API is reachable: call `https://app.across.to/api/swap/chains` and `/swap/tokens`
- [ ] Sign up for Coinbase Developer Platform, get production API key
- [ ] Verify Coinbase Onramp production: check supported chains (Base), widget integration method
- [ ] Test a small bridge: ETH on Base → ETH on Arbitrum via Across mainnet to confirm relayer fills

### Phase 1: Build the Across Bridge Script (4 hours)

This is the core deliverable. Must work end-to-end on mainnet.

**Script 1: `quote.ts`** — Get a bridge quote
- Call `GET /swap/approval` with ETH on Base (chain 8453) → ETH on Arbitrum (chain 42161)
- Parse response: approvalTxns, swapTx, fees, expectedFillTime
- Log quote details in human-readable format

**Script 2: `bridge.ts`** — Execute the bridge
- Load wallet from private key
- Execute approval txns (if any)
- Execute swap tx
- Log tx hash

**Script 3: `track.ts`** — Track deposit status
- Poll `GET /deposit/status` with deposit tx hash
- Exponential backoff (5s, 10s, 20s, 30s...)
- Log state transitions until filled
- Log fill tx hash on destination chain

**Script 4: `full-flow.ts`** — End-to-end orchestration
- Step 1: Simulate or execute Coinbase onramp (mock or real)
- Step 2: Wait for ETH balance on Base
- Step 3: Get quote from Across
- Step 4: Execute bridge
- Step 5: Track until filled
- Step 6: Verify ETH balance on Arbitrum
- Clean console output showing each state transition

**Test runs:**
- Run the full flow at least 2-3 times to verify mainnet reliability (note: each run costs real ETH + gas, keep amounts small)
- Test with intentionally bad inputs (wrong token address, zero amount) to document error responses
- Record a successful terminal session for presentation backup

### Phase 2: Coinbase Onramp Integration (3 hours)

**Production onramp flow:**
- Integrate Coinbase Onramp SDK or widget in production mode
- Configure for Base ETH delivery (chain ID 8453)
- Wire onramp completion to trigger bridge flow
- Test end-to-end: fiat (real, ~$1) → ETH on Base → Across bridge → ETH on Arbitrum

**Implementation details:**
- Build a typed `OnrampProvider` interface:
  ```typescript
  interface OnrampResult {
    txHash: string;
    chain: number;
    token: string;
    amount: bigint;
    recipient: string;
  }
  interface OnrampProvider {
    initiate(params: OnrampParams): Promise<OnrampSession>;
    waitForCompletion(session: OnrampSession): Promise<OnrampResult>;
  }
  ```
- Implement `CoinbaseOnrampProvider` using production Coinbase CDP Onramp
- The interface generalizes to other onramp providers (MoonPay, Stripe, etc.)
- Document the production integration and note what would change for other providers

### Phase 3: Partner Pitch Document (4 hours)

**Format:** Structured doc, 3-6 pages. Written for Coinbase's integration engineering team.

**Outline:**

**Page 1: Integration Overview**
- What this integration does (one paragraph)
- End-to-end flow diagram
- What Coinbase owns vs. what Across handles

**Page 2: Architecture**
- System boundary diagram
- State machine (the state transitions from Section 2)
- Where data/state lives at each hop

**Page 3: Implementation Guide**
- Across Swap API: how to get a quote, execute, track
- Code snippets from the working demo
- Token addresses, chain IDs, API endpoints

**Page 4: Failure Handling**
- What happens when each hop fails (table format)
- Quote expiry behavior
- Fill timeout and refund mechanics
- Monitoring: how to poll `/deposit/status`

**Page 5: Production Readiness**
- Already on mainnet: demo runs on real infrastructure with real tokens
- Cost: fee structure (LP fee + relayer fee), expected costs at ≤$50 volume
- Scaling: batch quoting, approval caching, status polling patterns
- API key + integrator ID: how to register for production access

**Page 6 (optional): Future Extensions**
- Embedded crosschain actions (bridge + DeFi in one tx)
- Multi-chain destination support
- Deposit addresses for recurring flows

### Phase 4: Internal Brief (3 hours)

**Format:** 2-3 pages. Written for the Across product and engineering team.

**Section 1: Friction Log**

Document every point of friction encountered while building, in this format:
> **What I tried → What I expected → What happened → What this means at scale**

Expected friction points to document:
- Testnet relayer unreliability (motivating the pivot to mainnet)
- Coinbase sandbox limitations (no on-chain token delivery)
- Error response quality from the API
- MulticallHandler address discovery
- Deposit tracking latency and polling pattern
- Documentation gaps (if any)
- Anything surprising about the Swap API behavior

**Section 2: Investment Recommendations (2-3, prioritized)**

Each recommendation follows this structure:
> **What to build → Who it unblocks → Why now → Effort estimate**

Likely candidates (to be validated during build):

1. **Webhook/event stream for fill status** — Every payments partner at scale needs push-based fill notifications. Polling `/deposit/status` doesn't scale to thousands of concurrent transfers. This unblocks the entire payments vertical, not just Coinbase.

2. **Onramp integration guide / reference architecture** — The onramp→bridge flow is the most common partner pattern. A published reference architecture (with code) would cut integration time from weeks to days. This compounds across every onramp partner (MoonPay, Stripe, Meld, etc.).

3. **Third candidate TBD during build** — Will emerge from actual friction encountered. Could be: better testnet DX, programmatic contract address discovery, improved error messages, or a deposit address expansion beyond Arbitrum-only.

### Phase 5: Architecture Appendix (2 hours)

- Sequence diagram: full mainnet flow with timing annotations (Base → Arbitrum, ~2s fills)
- System diagram: Coinbase production + Across mainnet + chains (Base, Arbitrum), with protocol/API boundaries labeled
- Generalization diagram: how the same architecture adapts to other onramp partners (swap Coinbase for MoonPay/Stripe — what changes, what stays the same) and other chain pairs
- Settlement mechanism comparison table (Intents vs. CCTP V2 vs. OFT) — shows awareness of Across's full architecture even though the demo only exercises Intents

### Phase 6: Polish and Presentation Prep (3 hours)

- [ ] Clean up repo: README with setup instructions, `.env.example`, clear file structure
- [ ] Final test run of the full flow — record terminal output
- [ ] Review partner pitch: would Coinbase's tech lead forward this to their team?
- [ ] Review internal brief: is every friction point tied to a compounding investment?
- [ ] Prepare for Q&A (see Section 5)

---

## 5. How to Present This in an Interview Setting

### Presentation Structure (15 minutes)

| Minutes | Section | What to show |
|---------|---------|-------------|
| 0-2 | **Context** | "Coinbase wants to let users buy ETH and land it on any chain. Here's how we make that work with Across." One slide, one sentence. |
| 2-5 | **Architecture** | System diagram + state machine. Walk through the happy path. Point out system boundaries — what Coinbase owns, what Across owns, where the user signs. |
| 5-8 | **Live demo or recorded run** | Show the terminal running `full-flow.ts`. Narrate each state transition. Mainnet fills are fast (~2s), so the live demo should be snappy. |
| 8-11 | **Failure handling** | "What happens when hop 2 fails? What about hop 3?" Walk through the failure table from the partner pitch. This is where you show depth. |
| 11-13 | **Internal findings** | Top 2-3 investment recommendations. Frame as: "Building this taught me X about the partner experience. Here's what would make the next integration faster." |
| 13-15 | **Generalization** | "This architecture works for any onramp partner. Here's what changes if you swap Coinbase for MoonPay or Stripe." One diagram. Close. |

### Q&A Preparation (45 minutes)

**"Why Coinbase?"**
→ Largest onramp. Production-ready SDK. Recognizable to the team. Architecture generalizes — I'll show how swapping in MoonPay changes only the onramp interface, not the bridge logic.

**"What happens when the relayer doesn't fill?"**
→ The fill deadline expires. Across refunds the depositor on the origin chain (or destination, depending on `refundOnOrigin` setting). The partner backend detects this via `/deposit/status` returning an expired state, and notifies the user. The fill deadline should be set conservatively and the partner should have a retry mechanism. On mainnet, fills typically happen in ~2s, so this is rare.

**"How does this change at 10x or 100x volume?"**
→ Three things change: (1) Polling `/deposit/status` per-transfer doesn't scale — need webhooks or an event stream. (2) Token approvals should be batched (approve once for a high amount, not per-tx). (3) At higher individual transfer sizes (>$1M), CCTP V2 activates automatically — no code change needed, but the partner should know fill times may differ.

**"What did you consider but reject?"**
→ Considered embedded crosschain actions (bridge + deposit into Aave on destination). Rejected because it adds complexity without demonstrating the core onramp→bridge flow. Would be a natural Phase 2 with the partner — "buy ETH, land it in a yield vault on the destination chain, one click."

**"What's the biggest gap you found in Across?"**
→ No push-based fill notifications. Every partner has to build their own polling loop. At scale, this is the single biggest integration tax. A webhook system would be the highest-leverage investment for the payments vertical.

**"Why not testnet?"**
→ Two practical blockers: (1) The Across testnet relayer was unreliable — fills were slow or didn't complete, making the demo flaky and untrustworthy. (2) The Coinbase Onramp sandbox doesn't deliver real on-chain tokens, so the end-to-end flow can't actually execute on testnet. For ~$1 of real ETH, mainnet gives us fast fills (~2s), real tokens, and a demo that definitively works. The cost is trivial; the confidence gain is enormous.

**"Why not use deposit addresses instead of the Swap API?"**
→ Deposit addresses (`/swap/counterfactual`) are early access, Arbitrum-origin only, HyperEVM/HyperCore destination only. For a general onramp flow, the Swap API is the right choice today. But deposit addresses are the better primitive for recurring/automated flows — I'd recommend expanding them.

