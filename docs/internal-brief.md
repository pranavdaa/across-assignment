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

### Medium: Rough edges that need handling but are not blocking

**4. No "amount too low" error**
The API returns valid quotes where fees consume 99%+ of the transferred value, with no warning. Partners must implement their own minimum amount check or end users will execute economically irrational transactions.

**5. Quote simulation fails when wallet has insufficient balance**
Quote response includes `simulationSuccess: false` when the wallet cannot cover the amount, but the quote otherwise looks valid (has amounts, fees, transaction data). Partners who do not check this field will attempt to execute quotes that revert on-chain, wasting gas.

---

## Section 2: Investment Recommendations

### Recommendation 1: Webhooks for fill status

Right now the only way to know if a deposit was filled is to poll `/deposit/status` in a loop. I built an exponential backoff poller (5s → 10s → 20s → 30s) with a 5-minute timeout. It works, but every partner will have to build the same thing.

A simple webhook — Across POSTs to a partner URL when the fill happens — would cut out a chunk of integration work and reduce load on the status endpoint. The indexer already has the data, it just needs a delivery mechanism.

### Recommendation 2: Testnet DX

The testnet relayer was down for ~9 hours during my build, with no fills happening for anyone. USDC routes through CCTP on testnet (~19 min fills) instead of Intents, which isn't documented. `/swap/chains` on the testnet API returns mainnet chains.

I ended up abandoning testnet and using mainnet with real money. That was fine for $1, but partners doing formal evaluations won't have that option. A working testnet is the front door for every new integration — if it's broken, developers bounce before they even get to the good parts.

---

## Summary

Mainnet Across works great. Intents fills are fast (~2s), the API is clean, and the integration is straightforward. The rough edges are around testnet reliability and the lack of push-based fill notifications.

---

## Acknowledgements

Shoutout to Kanisk from the Across Telegram community who helped me identify that the testnet relayer was down — saved me hours of debugging what turned out to be an infrastructure issue, not a code issue.
