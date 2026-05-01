# Unknowns & Risks

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Partner** | Coinbase CDP Onramp (production) | Explicitly named in case study, recognizable. Sandbox only simulates UI — doesn't deliver on-chain tokens, so production mode is required for an end-to-end demo. |
| **Flow** | USD → Coinbase Onramp (production) → ETH on Base → Across (Intents, ~2s fill) → ETH on Arbitrum | Onramp→bridge pattern on mainnet. Coinbase Onramp delivers ETH on Base (Coinbase's native L2), then Across bridges to Arbitrum via Intents with ~2s fills. |
| **Token** | Native ETH (not USDC, not WETH) | On mainnet, ETH uses Intents (~2s fills) while USDC routes through CCTP (slower). ETH is faster, simpler, and demonstrates Across's core relayer-based settlement. |
| **Chains** | Base → Arbitrum | Base is Coinbase's native L2 (natural onramp destination), Arbitrum is the top DeFi L2 (compelling bridge target). EVM-only, both well-supported by Across mainnet. |
| **Custody model** | Self-custodial (user signs via Coinbase Onramp widget) | Coinbase Onramp is a user-facing widget, not a custodial backend |
| **Volume** | ~$1 of real ETH | Mainnet with real money, but minimal amounts. Enough to demonstrate the full end-to-end flow without meaningful financial risk. |
| **Solana** | Excluded | Adds SPL/signing complexity with no payoff for the demo |
| **Environment** | Across mainnet API (`app.across.to/api`), no API key needed for rate-limited access | Pivoted from testnet: testnet relayer was unreliable, making demos fragile. Mainnet Intents fill in ~2s and are production-proven. |
| **Fallback partner** | Stripe test mode | If Coinbase sandbox access is slow or blocked |

## Product Ambiguities (mention in pitch/brief — don't build for these)

Production-grade concerns. Worth noting to show awareness, not worth over-engineering for a ~$1 demo.

- **Fill SLA / refund mechanics** — ~2s mainnet fills via Intents, unfilled deposits are refundable. Mention in failure-handling section of pitch.
- **CCTP V2 vs CCTPFast** — Swap API auto-selects. Irrelevant since we're bridging ETH (uses Intents, not CCTP).
- **appFee, sponsored routes, quote TTL** — production economics. One sentence in pitch is enough.

## Technical Ambiguities (must resolve during build)

| # | Unknown | Why it matters | How to resolve |
|---|---------|---------------|----------------|
| T1 | ~~Testnet token faucets.~~ | **Resolved.** USDC addresses discovered via `/swap/tokens`. Wallet funded. |  |
| T2 | ~~Testnet USDC fill time is ~19 min (CCTP).~~ | **Resolved.** Switched demo to bridge native ETH which uses Intents (10s fill). CCTP testnet latency flagged as friction point for internal brief — recommendation: testnet should have a fast-fill mode or warn developers about CCTP latency. |  |
| T3 | ~~Error response schema.~~ | **Resolved.** Schema: `{ type: "AcrossApiError", code, status, message, param, id }`. No explicit "amount too low" error — API returns valid quotes even when fees consume 99%+ of value. | Check fee-to-amount ratio in code to catch this edge case. |
| T4 | **MulticallHandler address discovery.** Varies by chain, no programmatic lookup documented. | Needed if using embedded actions (recipient must be MulticallHandler). | Check `/swap/chains` on mainnet. Otherwise hardcode from contracts table. Note in friction log. |
| T5 | **Deposit tracking latency.** 1-15 second indexing delay on `/deposit/status`. | Need polling logic in demo to confirm fills. | Build polling with backoff. Flag in internal brief as webhook investment candidate. |
| T6 | ~~Coinbase CDP Onramp sandbox specifics.~~ | **Resolved.** Sandbox only simulates the UI — it does not deliver tokens on-chain. Using production mode instead, which delivers real ETH on Base. |  |
| T7 | **No webhook/callback for fill status.** All tracking is poll-based. | Fine for a demo. Flag in internal brief as a structural gap for payments partners at scale. | Build polling in demo. Recommend webhook system in internal brief. |

## Risks in Execution

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | **72-hour time constraint across four deliverables.** | High | Time-box: ~8h explore, ~12h build, ~8h write deliverables, ~4h polish. Cut scope early. |
| R2 | **Coinbase Onramp production integration requires valid CDP project config.** | Medium | Fallback to Stripe test mode. If both are blocked, stub the onramp hop with typed interfaces and a mock. Case study explicitly permits this. |
| R3 | **Demo breaks during live presentation.** | Medium | Record a successful run as backup. Structure presentation: code + architecture first, live demo second. |
| R4 | **Scope creep.** Temptation to build a full app vs. a clean annotated script. | Medium | A TypeScript script with clear steps > a half-finished Next.js app. |
| R5 | **Partner pitch is too Across-centric.** | High | Litmus test: would Coinbase's engineering lead forward this to their team? If it explains what Across is for more than 1 slide, it's wrong. |
| R6 | **Internal brief is too shallow.** | Medium | Pattern: "Tried X, expected Y, got Z — here's what this means at scale." Tie to compounding investments, not point fixes. |
| R7 | **The 45-min Q&A is the real evaluation.** | High | Prepare for: "Why Coinbase?", "What if the relayer doesn't fill?", "How does this change at 10x volume?", "What did you reject and why?" |
| R8 | **Real money on mainnet.** Using real ETH means transactions have real cost (gas + bridge fees + onramp fees). A bug or misconfigured address could lose funds. | Low | Keep amounts tiny (~$1). Double-check recipient addresses. Verify quotes before signing. Total exposure is capped at a few dollars — acceptable for a demo. |
