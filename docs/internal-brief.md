# Internal Brief: Coinbase Onramp + Across Bridge Integration

**Author:** Senior Solutions Architect
**Date:** May 2025
**Audience:** Across Protocol product and engineering team
**Scope:** Friction encountered and investment recommendations from building an end-to-end Coinbase Onramp + Across bridge integration

---

## Proven Flow

Fiat USD &rarr; Coinbase Onramp (production) &rarr; ETH on Base &rarr; Across mainnet bridge (Intents, ~2s fill) &rarr; ETH on Arbitrum

This flow works. Mainnet Intents fills are fast and reliable. The integration surface is clean once you know what to avoid. This brief documents everything I hit along the way, and three investments that would meaningfully reduce partner integration time.

---

## Section 1: Friction Log

Each item follows the format: **Tried X &rarr; Expected Y &rarr; Got Z &rarr; Means this at scale.**

### Critical: Blocked the integration or forced a pivot

**1. Testnet relayer unreliability**
Tried bridging ETH on Arbitrum Sepolia testnet via Intents. Expected ~10s fill. Got deposits stuck as "pending" indefinitely. Confirmed system-wide: no fills for any depositor in approximately 9 hours. Had to pivot the entire demo to mainnet with real money. Means at scale: partners evaluating Across on testnet will hit this and bounce. A dead testnet is worse than no testnet, because it wastes days of debugging before the partner realizes the problem is infrastructure, not their code.

**2. USDC routes through CCTP on testnet, not Intents**
Tried bridging USDC, the obvious demo token for a payments integration. Expected Intents with ~10s fill. Got CCTP with ~19 minute fill time. This is not documented anywhere. Only discovered by reading the `type` field in the quote response. Means at scale: partners building onramp flows will choose USDC as their first token (it is the default for every fiat onramp), get a 19-minute fill on testnet, and conclude Across is too slow for payments use cases. The Intents speed advantage is invisible for the most common partner token on testnet.

**3. Coinbase Onramp sandbox does not deliver tokens**
Tried using Coinbase sandbox for testnet integration. Expected simulated USDC delivery on-chain. Got UI simulation only, with no on-chain token delivery. Had to pivot to production with real money. Means at scale: every onramp partner integration requires production testing with real funds. There is no way to validate the end-to-end flow on testnet. This is a Coinbase limitation, not an Across one, but it compounds with Across testnet issues to make the full testnet path non-viable.

### High: Significant developer confusion or wasted time

**4. `/swap/chains` returns mainnet chains on the testnet API**
Called the testnet API expecting testnet chains in the response. Got the mainnet chain list. Means at scale: developers trying to discover supported testnet routes will get incorrect chain IDs, build against the wrong configuration, and waste time debugging mismatches between what the API says is available and what actually works on testnet.

**5. Session token auth for Coinbase Onramp**
URL-based onramp was deprecated in July 2025. Had to implement JWT auth using EdDSA/Ed25519 to get session tokens. The `addresses` field format is protobuf-backed (array of objects, not a map). When the wrong format is sent, the error message is `"proto: syntax error"` with no indication of what field is malformed or what format is expected. Means at scale: this is a Coinbase friction point, but every partner integrating fiat onramp into an Across flow will hit it. A reference implementation eliminates this entirely.

**6. No webhook or event stream for fill status**
Must poll `/deposit/status` with exponential backoff. Built a polling loop with 5s &rarr; 10s &rarr; 20s &rarr; 30s intervals and a 5-minute timeout. Fine for a demo. Means at scale: every payments partner handling thousands of concurrent transfers will need to build their own polling infrastructure. This is the single most repeated piece of integration work across all partners.

### Medium: Rough edges that need handling but are not blocking

**7. `swapTx.gas` is "0"**
Quote response returns a gas field set to `"0"`. Must handle gas estimation client-side using the RPC node. Not documented. Means at scale: developers who trust the API gas value will submit transactions that fail or get stuck. Every integration needs to add a gas estimation step that the API response implies is unnecessary.

**8. No "amount too low" error**
Sent tiny amounts expecting a validation error. The API returns valid quotes where fees consume 99%+ of the transferred value. A user bridging 0.0001 ETH gets a quote showing ~0 output after fees, with no warning. Means at scale: partners must implement their own minimum amount check. Without it, end users will execute transactions that are economically irrational, generating support tickets.

**9. Deposit tracking API returns 404 briefly after deposit**
First poll after a deposit transaction is confirmed returns a 404. Subsequent polls work normally. This is an indexing delay. Means at scale: naive integrations that treat 404 as "deposit not found" will surface false errors to users. Every integration needs to distinguish "not yet indexed" from "genuinely not found," likely by retrying 404s for a grace period after deposit.

**10. Quote simulation fails when wallet has insufficient balance**
Quote response includes `simulationSuccess: false` when the wallet cannot cover the amount. This is correct behavior, but the quote otherwise looks valid (has amounts, fees, transaction data). Means at scale: partners who do not check the `simulationSuccess` field will attempt to execute quotes that will revert on-chain, wasting gas. The field should be more prominent in documentation, or the API should return an error status rather than a valid-looking quote.

---

## Section 2: Investment Recommendations

Three investments, prioritized by the number of partners they unblock and the friction they eliminate.

### Recommendation 1: Webhook/event stream for fill status

**What to build:** Push-based fill notifications. Two options: (a) webhook URL registration per deposit, where Across POSTs a payload to a partner-provided URL when the deposit status changes, or (b) an SSE/WebSocket stream that partners can subscribe to for real-time fill events. Ideally both, but webhooks alone cover 90% of the use case.

**Who it unblocks:** Every payments partner at scale. Coinbase, MoonPay, Stripe, Transak, Ramp, and any partner processing more than a handful of concurrent transfers. This is not a niche need. It is the standard expectation for any payments infrastructure API.

**Why now:** Polling is the single biggest integration tax. Every partner builds the same exponential backoff loop, the same 404 grace period handler, the same timeout logic. This is duplicated work across every integration. Worse, polling at scale creates unnecessary load on the `/deposit/status` endpoint. A push-based system is better for both partners and for Across infrastructure.

**Effort estimate:** Medium. The Across indexer already has the fill data. The investment is in the delivery mechanism: a webhook dispatcher (queue + retry logic) or an event stream endpoint. Standard infrastructure patterns, no novel engineering required.

---

### Recommendation 2: Onramp partner reference architecture and integration guide

**What to build:** A published guide with working code showing the fiat onramp &rarr; bridge flow pattern. This should cover: session/auth management with the onramp provider, balance detection on the origin chain (polling for token arrival), automatic quote and bridge execution once funds land, fill tracking with status updates to the end user, and error handling at each stage (onramp failure, insufficient balance, bridge revert, fill timeout). Ship it as a GitHub repo with a README, not just a docs page.

**Who it unblocks:** All onramp partners. Every fiat-to-crypto provider that wants to offer cross-chain delivery will follow this exact pattern. The specific onramp provider changes (Coinbase vs. MoonPay vs. Stripe), but the Across integration side is identical. A reference architecture cuts integration time from weeks to days.

**Why now:** Onramp is the most common partner pattern for Across. Every fiat provider wants to deliver tokens on the user's preferred chain, not just the chain their liquidity sits on. This reference architecture compounds: build it once, and every onramp partner benefits. The demo code built for this case study is roughly 80% of the way to a publishable reference implementation.

**Effort estimate:** Low to medium. The core code exists. The work is in generalizing it (abstracting the onramp provider interface), adding production-grade error handling, writing the guide, and publishing it. A solutions architect could ship this in 1-2 weeks.

---

### Recommendation 3: Testnet reliability and developer experience

**What to build:** Three things. First, a reliable testnet relayer. If running a full relayer on testnet is too costly, offer a faucet-funded fast-fill mode: a lightweight service that fills small testnet deposits quickly so developers can test the full flow without mainnet funds. Second, fix the `/swap/chains` endpoint on the testnet API so it returns testnet chains, not mainnet chains. Third, document the behavioral differences between testnet and mainnet: specifically that USDC routes through CCTP (not Intents) on testnet with ~19 minute fills, and that testnet fill times are not representative of mainnet performance.

**Who it unblocks:** Every new developer evaluating Across. The testnet is the front door for technical evaluation. Partners with strict staging environment requirements (banks, regulated fintechs, enterprise payments companies) will not skip testnet. They will either get it working on testnet first, or they will choose a different bridge.

**Why now:** The current testnet developer experience forced this integration to abandon testnet entirely and use real money on mainnet. That was acceptable for a case study with a $1 budget. It is not acceptable for a partner doing a formal technical evaluation with procurement and security review processes. A non-functional testnet is actively harmful: it is worse than having no testnet, because developers waste time on it before discovering they need mainnet anyway.

**Effort estimate:** Medium. The relayer fix may be operational (ensuring the existing relayer stays running) or engineering (building a lightweight fast-fill service). The `/swap/chains` fix is small. The documentation is a few hours of writing. The total effort depends on whether the relayer issue is a monitoring gap or an architecture gap.

---

## Summary

The Across mainnet bridge works well. Intents fills are fast (~2 seconds), the API surface is clean, and the integration pattern is straightforward once you know the gotchas. The friction is concentrated in three areas: testnet reliability, missing push-based notifications, and lack of reference implementations for the most common integration pattern. Fixing these three things would materially reduce the time and risk for every new partner integration.
