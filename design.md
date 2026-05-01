# Design Document: Coinbase Onramp + Across Crosschain Bridge

## Overview

**Problem:** A user wants to buy ETH with fiat and receive it on a specific destination chain. Today, onramp providers like Coinbase deliver crypto to a limited set of chains. If the user needs ETH on a chain Coinbase doesn't directly support — or wants to optimize for cost and speed across chains — they must manually bridge after purchasing. That's two separate products, two transactions, and a fragmented experience.

**Solution:** Compose Coinbase's onramp with Across Protocol's crosschain bridge into a single user flow. The user buys ETH via Coinbase, and Across automatically moves it to the destination chain. From the user's perspective: pay fiat, receive ETH on the chain they want.

**Scope of this demo:** Fiat USD → Coinbase Onramp (production) → ETH on Base → Across mainnet → ETH on Arbitrum. Mainnet environment, ~$1 of real ETH.

---

## System Architecture

### Components

There are four distinct systems involved in this flow. Each has a clear responsibility boundary.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│   │              │     │                  │     │                  │   │
│   │   Coinbase   │────▶│   Base           │────▶│   Arbitrum       │   │
│   │   Onramp     │     │                  │     │                  │   │
│   │              │     │                  │     │                  │   │
│   │ (production) │     │  Origin Chain    │     │  Destination     │   │
│   └──────────────┘     └──────────────────┘     └──────────────────┘   │
│          │                      │                        ▲             │
│          │                      │                        │             │
│      Delivers ETH          User signs              Relayer fills      │
│      to user wallet        bridge tx               the intent         │
│          │                      │                        │             │
│          │                      ▼                        │             │
│          │              ┌──────────────────┐             │             │
│          │              │                  │             │             │
│          └─────────────▶│   Across         │─────────────┘             │
│                         │   Swap API       │                           │
│                         │                  │                           │
│                         │  (mainnet)       │                           │
│                         └──────────────────┘                           │
│                                 │                                      │
│                                 ▼                                      │
│                         ┌──────────────────┐                           │
│                         │  Across Relayer   │                           │
│                         │  Network          │                           │
│                         │                  │                           │
│                         │  Fills intents   │                           │
│                         │  on destination  │                           │
│                         └──────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | What it does | What it does NOT do |
|-----------|-------------|---------------------|
| **Coinbase Onramp** | Collects fiat payment, converts to ETH, delivers ETH to a wallet address on Base | Does not bridge crosschain. Does not manage the destination chain selection beyond its own supported set. |
| **User Wallet** | Holds ETH on origin chain (Base). Signs the bridge transaction. | Does not route, does not select settlement mechanism. Purely a signer. |
| **Across Swap API** | Generates a bridge quote (fees, fill time, calldata). Returns ready-to-execute transaction data. Selects optimal settlement mechanism automatically. | Does not hold user funds. Does not execute transactions — the user's wallet does. |
| **Across Relayer Network** | Fills the intent on the destination chain (Arbitrum). Fronts capital so the user gets funds in ~2 seconds. Gets repaid later via Across's bundled settlement. | Does not interact with the user directly. Operates asynchronously after the deposit tx is submitted. |

### Why These Four and Not Fewer?

This decomposition isn't arbitrary — it reflects the actual trust and custody boundaries:

- **Coinbase** holds a money transmitter license and handles the fiat-to-crypto conversion. That's a regulated boundary.
- **The user's wallet** is the only component that signs transactions. Self-custodial throughout.
- **Across Swap API** is stateless from the integrator's perspective — you call it, get calldata, execute it. No session, no account, no stored state.
- **Across Relayer Network** is an independent economic actor. Relayers compete to fill intents and earn fees. The user doesn't choose a relayer; the network self-coordinates.

---

## Data / Request Flow

### Happy Path — Step by Step

```
User                    Coinbase              Base                   Across API           Arbitrum
 │                        │                        │                    │                     │
 │  1. Buy ETH (~$1)      │                        │                    │                     │
 │───────────────────────▶│                        │                    │                     │
 │                        │                        │                    │                     │
 │                        │  2. Deliver ETH        │                    │                     │
 │                        │───────────────────────▶│                    │                     │
 │                        │                        │                    │                     │
 │  3. ETH in wallet      │                        │                    │                     │
 │◀───────────────────────┼────────────────────────│                    │                     │
 │                        │                        │                    │                     │
 │  4. Request bridge quote                        │                    │                     │
 │─────────────────────────────────────────────────────────────────────▶│                     │
 │                        │                        │                    │                     │
 │  5. Quote response (calldata, fees)             │                    │                     │
 │◀─────────────────────────────────────────────────────────────────────│                     │
 │                        │                        │                    │                     │
 │  6. Sign & send swap tx (native ETH, no approval needed)            │                     │
 │────────────────────────────────────────────────▶│                    │                     │
 │                        │                        │                    │                     │
 │                        │                        │  7. Deposit event  │                     │
 │                        │                        │  emitted           │                     │
 │                        │                        │───────────────────▶│                     │
 │                        │                        │                    │                     │
 │                        │                        │     8. Relayer fills intent              │
 │                        │                        │                    │────────────────────▶│
 │                        │                        │                    │                     │
 │  9. Poll /deposit/status                        │                    │                     │
 │─────────────────────────────────────────────────────────────────────▶│                     │
 │                        │                        │                    │                     │
 │  10. Status: filled + fill tx hash              │                    │                     │
 │◀─────────────────────────────────────────────────────────────────────│                     │
 │                        │                        │                    │                     │
 │  11. ETH available on Arbitrum                  │                    │                     │
 │◀────────────────────────────────────────────────────────────────────────────────────────────│
```

### What Each API Call Looks Like

**Step 4 — Request bridge quote:**
```
GET https://app.across.to/api/swap/approval
  ?tradeType=minOutput
  &originChainId=8453                # Base
  &destinationChainId=42161          # Arbitrum
  &inputToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE  # Native ETH
  &outputToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE  # Native ETH
  &amount=400000000000000            # ~$1 of ETH (18 decimals)
  &depositor={WALLET_ADDRESS}
```

**Step 5 — Quote response (key fields):**
```json
{
  "swapTx": {
    "chainId": 8453,
    "to": "0x...",
    "data": "0x...",
    "value": "400000000000000",
    "gas": "250000"
  },
  "fees": {
    "total": "2000000000000",
    "totalMax": "4000000000000"
  },
  "expectedFillTime": 2,
  "quoteExpiryTimestamp": 1746100000
}
```

**Step 9 — Poll deposit status:**
```
GET https://app.across.to/api/deposit/status
  ?depositTxnRef={SWAP_TX_HASH}
  &originChainId=8453
```

### Failure Paths

Every hop can fail. The design must account for each:

| Step | Failure | Detection | Recovery |
|------|---------|-----------|----------|
| 1-2 | **Onramp fails** — payment declined, user abandons | Coinbase Onramp SDK returns error or session timeout | Flow ends. No on-chain state created. User retries. |
| 4-5 | **Quote fails** — amount too low, route unavailable, API down | HTTP error or `isAmountTooLow: true` in response | Show error to user. Suggest different amount or route. No funds at risk — ETH still in wallet. |
| 5→6 | **Quote expires** — user takes too long between quote and signing | `quoteExpiryTimestamp` passed | Re-fetch quote before executing. Build a freshness check into the flow. |
| 6 | **Swap tx fails** — reverts on-chain | Tx receipt `status: 'reverted'` | ETH still in wallet. Retry with fresh quote. |
| 7-8 | **Fill timeout** — no relayer fills before deadline | Poll `/deposit/status` returns expired state | Across refunds depositor on origin chain (Base). Partner backend detects and notifies user. |
| 9-10 | **Tracking API down** — can't confirm fill | HTTP errors on `/deposit/status` | Retry with backoff. As fallback, check destination chain ETH balance directly via RPC. |

**Key insight for the partner pitch:** At no point in the failure path does the user permanently lose funds. Before the swap tx, ETH is in the wallet. After the swap tx, either the relayer fills (success) or the fill deadline expires and Across refunds (recovery). This is a fundamental property of the intent architecture.

---

## Integration Points

There are three integration seams where systems connect. Each has a different contract surface and different failure characteristics.

### Integration Point 1: Coinbase Onramp → User Wallet

| Property | Detail |
|----------|--------|
| **Interface** | Coinbase Onramp SDK / widget (frontend embed or redirect) |
| **Data exchanged** | Wallet address, target chain (Base), target token (ETH), fiat amount |
| **Completion signal** | Coinbase SDK callback or event. Verify on-chain: ETH balance appears at wallet address on Base. |
| **Latency** | Seconds to minutes (depends on payment method, user interaction) |
| **Failure mode** | User abandons, payment fails. No on-chain state — clean failure. |
| **Our code** | `src/onramp/coinbase.ts` — wraps the Coinbase SDK, polls for ETH balance on origin chain (Base) |

### Integration Point 2: User Wallet → Across Swap API

| Property | Detail |
|----------|--------|
| **Interface** | REST API: `GET /swap/approval` returns calldata. User wallet executes it on-chain. |
| **Data exchanged** | Request: origin/destination chain IDs (8453/42161), token addresses (native ETH), amount, depositor address. Response: swap tx calldata, fees, fill time estimate. |
| **Completion signal** | Swap tx confirmed on-chain (tx receipt with `status: 'success'`). |
| **Latency** | API call: <1s. Swap tx: ~2s on Base. No separate approval needed for native ETH. |
| **Failure mode** | Quote errors (amount too low, route unavailable), quote expiry, tx revert. All recoverable — funds remain in wallet. |
| **Our code** | `src/across/quote.ts` — fetches quote. `src/across/bridge.ts` — executes swap. |

### Integration Point 3: Across Relayer Network → Destination Chain

| Property | Detail |
|----------|--------|
| **Interface** | No direct integration. This happens inside the Across protocol. We observe it via `GET /deposit/status`. |
| **Data exchanged** | We send: deposit tx hash. We receive: fill status, fill tx hash. |
| **Completion signal** | `/deposit/status` returns filled status with fill tx hash on Arbitrum. |
| **Latency** | ~2 seconds fill time on mainnet. Plus 1-15 second indexing delay before status API reflects the fill. |
| **Failure mode** | No relayer fills before deadline → refund on origin chain (Base). Tracking API down → fall back to direct RPC balance check. |
| **Our code** | `src/across/track.ts` — polls status with exponential backoff until filled or timed out. |

### Integration Boundary Diagram

```
    Coinbase Domain              │        Across Domain             │      Blockchain Domain
                                 │                                  │
  ┌─────────────────┐           │   ┌──────────────────┐          │   ┌─────────────────────┐
  │ Coinbase Onramp │           │   │ Across Swap API  │          │   │ Base                │
  │ SDK / Widget    │           │   │                  │          │   │                     │
  │                 │           │   │ GET /swap/        │          │   │ - SpokePool contract│
  │ - Fiat payment  │           │   │     approval     │          │   │ - Native ETH        │
  │ - ETH delivery  │           │   │                  │          │   │ - User's deposit tx │
  └────────┬────────┘           │   │ GET /deposit/    │          │   └─────────────────────┘
           │                    │   │     status       │          │
      IP #1: SDK callback       │   └────────┬─────────┘          │   ┌─────────────────────┐
      + on-chain balance        │            │                    │   │ Arbitrum             │
      verification              │       IP #2: REST API           │   │                     │
                                │       + on-chain tx             │   │ - Relayer fill tx   │
                                │       execution                 │   │ - ETH arrives       │
                                │            │                    │   └─────────────────────┘
                                │       IP #3: Poll-based         │
                                │       status observation        │
                                │                                  │
```

---

## State Ownership — Where Data Lives

A critical question for any multi-system integration: who is the source of truth at each stage?

| State | Source of truth | How we read it |
|-------|----------------|---------------|
| Fiat payment status | Coinbase | Onramp SDK callback / Coinbase API |
| ETH balance on origin chain | Base blockchain | `eth_getBalance` via RPC |
| Bridge quote (fees, calldata) | Across Swap API | `GET /swap/approval` — ephemeral, not stored, expires quickly |
| Deposit status | Across indexer | `GET /deposit/status` — 1-15s indexing delay after on-chain event |
| Fill status | Arbitrum blockchain, observed via Across indexer | `GET /deposit/status` returns fill tx hash. Can verify on-chain independently. |
| ETH balance on destination | Arbitrum blockchain | `eth_getBalance` via RPC |

**Key design principle:** The blockchain is always the ultimate source of truth. API responses (from both Coinbase and Across) are convenient observations of on-chain state, but the integration code should be able to verify independently via RPC when the API is down or slow.

---

## Why These Choices Were Made

### Why Coinbase as the onramp partner?

- Explicitly named in the case study — strong signal it's the intended partner.
- Largest retail onramp provider. If this integration works, it's immediately relevant to Across's BD pipeline.
- Base is Coinbase's native L2, making the onramp-to-bridge flow seamless (fiat → ETH on Base in one step).
- The architecture generalizes: swap Coinbase for MoonPay, Stripe, or Meld — only the onramp module changes. The Across bridge logic is identical.
- Recognizable to the hiring panel without explanation.

### Why Base → Arbitrum?

- **Base is Coinbase's native L2** — it's the most natural destination for Coinbase Onramp. Users buying crypto through Coinbase can receive ETH directly on Base with minimal friction.
- **Arbitrum is the most popular L2 DeFi destination** — bridging to Arbitrum demonstrates real user demand (DeFi protocols, GMX, Aave, etc.).
- Both are fully supported by the Across mainnet bridge with deep relayer liquidity.
- Native ETH bridging uses the **Intents** settlement mechanism — relayers fill in ~2 seconds, giving users a near-instant experience.
- The architecture generalizes: changing `destinationChainId` routes to any of 23+ Across-supported chains.

### Why the Swap API and not direct SpokePool deposits?

| Approach | What you get | What you manage |
|----------|-------------|-----------------|
| **Swap API** (`/swap/approval`) | Ready-to-execute calldata, approval txns, fee calculation, mechanism selection, gas estimation | Almost nothing — call the API, execute the returned txns |
| **Direct SpokePool** (`/suggested-fees` + `depositV3`) | Lower-level control, custom message passing, custom fill deadlines | Token approvals, calldata encoding, integrator ID appending, gas estimation, mechanism-specific parameters |

For an onramp integration, the Swap API is the right abstraction. The partner doesn't need low-level control — they need "bridge ETH from A to B" to just work. Direct SpokePool deposits make sense for partners building embedded crosschain actions or custom settlement logic.

### Why TypeScript scripts and not a frontend app?

- A script is what a partner engineer would build first when prototyping an integration.
- Scripts are runnable, debuggable, and reviewable without environment setup.
- A frontend would require React/Next.js boilerplate that adds noise without demonstrating integration judgment.
- The case study evaluates "hands-on technical fluency" — a working script proves this more directly than a polished UI.

### Why poll-based tracking and not event-driven?

Not by choice — Across does not currently offer webhooks or event streams for fill status. The only option is polling `GET /deposit/status`. The demo implements exponential backoff polling (5s → 10s → 20s → 30s cap). This works for a demo but is a scaling bottleneck for production payments integrations. This is flagged as the #1 investment recommendation in the internal brief.

---

## Demo vs. Full Production — What Changes at Scale

This demo runs on mainnet with real ETH (~$1). Scaling to a production partner integration requires minimal code changes but additional operational setup:

| Concern | This demo | Full production |
|---------|----------:|:----------------|
| Across API URL | `app.across.to/api` | Same |
| API key | Not required at demo volume | Required for rate limits (request via Telegram) |
| Integrator ID | Not required | Required (2-byte hex, e.g. `0xdead`) — enables fee tracking and analytics |
| Fill speed | ~2 seconds | Same (~2s for Intents) |
| Settlement mechanism | Intents (at small volumes) | Intents, CCTP V2, or OFT (auto-selected by Across based on volume and route) |
| Volume | ~$1 of ETH | Unlimited — relayer network scales with liquidity |
| Coinbase Onramp | Production mode, real fiat | Same, with partner-level Coinbase API credentials |
| Monitoring | Manual / script output | Webhooks (when available), dashboards, alerting |

The code and architecture are identical. Scaling requires registering as an Across integrator partner, obtaining an API key, and adding production monitoring.

---

## What This Architecture Enables Next

This design is intentionally a foundation. Once the basic onramp→bridge flow is live, the same architecture supports:

| Extension | What changes | Across feature used |
|-----------|-------------|---------------------|
| **Multi-chain destination** | User picks any of 23+ destination chains at purchase time | Same Swap API, different `destinationChainId` |
| **Bridge + DeFi in one tx** | ETH lands on destination and is deposited into Aave/yield vault atomically | Embedded crosschain actions (`POST /swap/approval` with `actions` array) |
| **Recurring deposits** | Merchant receives payments on a static address, funds auto-bridge to treasury chain | Counterfactual deposit addresses (`/swap/counterfactual`) — currently Arbitrum-origin only |
| **Multi-token support** | User buys USDC/WBTC via onramp, bridges crosschain | Same Swap API, different token addresses |
| **Partner fee margin** | Partner takes a cut on each bridge | `appFee` + `appFeeRecipient` params on `/swap/approval` |
