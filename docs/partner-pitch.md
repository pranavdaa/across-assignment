# Crosschain Onramp Delivery: Across + Coinbase Integration Proposal

**From:** Solutions Architecture, Across Protocol
**To:** Coinbase Onramp Integration Engineering
**Date:** May 2026

---

## 1. Integration Overview

Coinbase Onramp currently delivers purchased crypto to a single destination chain. By adding Across as a post-purchase bridging layer, users who buy ETH (or any supported asset) can receive it on their preferred chain -- Base, Arbitrum, Optimism, Polygon, or any of 23+ supported networks -- without leaving the Coinbase flow. The bridge step is invisible to the user: funds land on the destination chain in ~2 seconds via Across's Intents relayer network, at a cost under $0.50 for typical retail amounts.

A working demo of this exact flow ships with this proposal. It runs on mainnet with real funds.

### End-to-End Flow

```
User clicks "Buy ETH"
        |
        v
+-------------------+      +---------------------+      +------------------+
|  Coinbase Onramp  | ---> |  ETH lands on Base  | ---> |  Across Bridge   |
|  (fiat -> crypto) |      |  (origin chain)     |      |  Base -> dest    |
+-------------------+      +---------------------+      +------------------+
                                                                |
                                                                v
                                                    +------------------------+
                                                    |  ETH on Arbitrum (or   |
                                                    |  any of 23+ chains)    |
                                                    +------------------------+
                                                         ~2s fill time
```

### Ownership Boundary

| Responsibility | Owner |
|---|---|
| Fiat payment, KYC, compliance | Coinbase |
| Crypto delivery to origin chain | Coinbase |
| Bridge quote, execution, fill | Across |
| Destination chain delivery | Across relayer network |
| Fee display / UX | Coinbase (using Across quote data) |
| Partner fee margin | Configurable via `appFee` param |

---

## 2. Architecture

### System Boundary Diagram

```
Coinbase Infrastructure                     Across Infrastructure
========================                     ======================

+--------------+                             +------------------+
| Onramp UI    |                             | Swap API         |
| (pay.coinbase|                             | /swap/approval   |
|  .com)       |                             | /deposit/status  |
+--------------+                             +------------------+
       |                                            |
       v                                            v
+--------------+    on-chain tx              +------------------+
| CDP Token    | ---------------------->     | SpokePool        |
| API          |    (origin chain)           | Contract         |
+--------------+                             +------------------+
                                                    |
                                             Intents / CCTP V2
                                                    |
                                                    v
                                             +------------------+
                                             | Relayer Network  |
                                             | (fills on dest)  |
                                             +------------------+
```

### State Machine

```
initiated ──> onramping ──> quoting ──> bridging ──> pending_fill ──> filled ──> complete
    |             |            |           |              |
    |             v            v           v              v
    +-------> [abort]     [re-quote]  [revert ->     [timeout ->
                                       refund]        refund]
```

| State | Owner | Data Location |
|---|---|---|
| `initiated` | Coinbase | Coinbase session |
| `onramping` | Coinbase | Coinbase transaction + on-chain balance watch |
| `quoting` | Across API | In-memory; quote has `quoteExpiryTimestamp` |
| `bridging` | Origin chain | Deposit tx hash on origin chain |
| `pending_fill` | Across relayer network | `GET /deposit/status` returns `pending` |
| `filled` | Destination chain | `GET /deposit/status` returns `filled` + fill tx hash |
| `complete` | Coinbase | Display confirmation to user |

---

## 3. Implementation Guide

### API Surface

Across exposes two endpoints. That is the entire integration surface.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://app.across.to/api/swap/approval` | GET | Get quote + ready-to-execute calldata |
| `https://app.across.to/api/deposit/status` | GET | Poll fill status |

### Step 1: Get a Quote

A single GET request returns the deposit calldata, fee breakdown, expected fill time, and simulation result. No SDK required.

```typescript
const query = new URLSearchParams({
  tradeType: "minOutput",
  originChainId: "8453",                                    // Base
  destinationChainId: "42161",                              // Arbitrum
  inputToken: "0x0000000000000000000000000000000000000000",  // Native ETH (Base)
  outputToken: "0x0000000000000000000000000000000000000000", // Native ETH (Arbitrum)
  amount: "500000000000000",                                // 0.0005 ETH in wei
  depositor: walletAddress,
});

const res = await fetch(`https://app.across.to/api/swap/approval?${query}`);
const quote = await res.json();
```

The response includes everything needed to execute:

```typescript
interface AcrossQuote {
  swapTx: {
    simulationSuccess: boolean;  // Pre-validated on-chain
    to: string;                  // SpokePool contract address
    data: string;                // Ready-to-submit calldata
    value: string;               // ETH value to send (wei)
    gas: string;                 // Estimated gas
    chainId: number;             // Must match origin chain
  };
  approvalTxns: [];              // Empty for native ETH -- zero approvals
  expectedOutputAmount: string;  // What user receives on destination
  expectedFillTime: number;      // Seconds -- typically 2-4
  fees: {
    total: { amount: string; pct: string };  // LP + relayer fee combined
  };
  quoteExpiryTimestamp: number;  // Unix timestamp -- re-fetch if expired
  id: string;                    // Quote ID for tracking
}
```

**Native ETH bridging requires zero token approvals.** The `approvalTxns` array is empty. For ERC-20 tokens (USDC, WETH), the API returns pre-built approval transactions in the same response.

### Step 2: Execute the Bridge

Submit the calldata from the quote directly to the origin chain. This is a single transaction.

```typescript
// quote.swapTx contains everything -- just forward it to the wallet
const depositTxHash = await walletClient.sendTransaction({
  to: quote.swapTx.to as `0x${string}`,
  data: quote.swapTx.data as `0x${string}`,
  value: quote.swapTx.value ? BigInt(quote.swapTx.value) : 0n,
});

// Wait for on-chain confirmation
const receipt = await publicClient.waitForTransactionReceipt({
  hash: depositTxHash,
});
```

If the quote included approval transactions (ERC-20 tokens), execute them first:

```typescript
if (quote.approvalTxns?.length) {
  for (const approvalTx of quote.approvalTxns) {
    const hash = await walletClient.sendTransaction({
      to: approvalTx.to as `0x${string}`,
      data: approvalTx.data as `0x${string}`,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}
```

### Step 3: Track the Fill

Poll `/deposit/status` with exponential backoff. Typical fills complete in 2-4 seconds; the poll catches it on the first or second check.

```typescript
const query = new URLSearchParams({
  depositTxnRef: depositTxHash,
  originChainId: "8453",
});

const res = await fetch(
  `https://app.across.to/api/deposit/status?${query}`
);
const status = await res.json();
// status.status: "pending" | "filled" | "expired" | "refunded"
// status.fillTx: destination chain transaction hash (when filled)
```

Recommended backoff schedule: `5s -> 10s -> 20s -> 30s` (cap). Total timeout: 5 minutes. In practice, the first poll at 5 seconds already returns `filled` for Intents-routed deposits.

### Reference: Chain IDs and Token Addresses

| Chain | Chain ID | Native ETH | USDC | WETH |
|---|---|---|---|---|
| Base | 8453 | `0x000...000` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x4200000000000000000000000000000000000006` |
| Arbitrum | 42161 | `0x000...000` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` |

Native ETH address across all chains: `0x0000000000000000000000000000000000000000`

---

## 4. Failure Handling

### Failure Matrix

| Failure Point | What Happens | User Impact | Resolution |
|---|---|---|---|
| Onramp payment fails | Coinbase handles -- no crypto leaves fiat rails | None -- standard Coinbase error flow | Retry purchase |
| Onramp succeeds but bridge quote fails | ETH sits on origin chain (user's wallet) | User has ETH on Base; no funds lost | Retry quote or user manually bridges |
| Quote expires before execution | `swapTx` calldata becomes invalid | Transaction reverts if submitted | Re-fetch quote (GET request, <200ms) |
| Bridge tx reverts on-chain | ETH stays in user's wallet on origin chain | No funds leave the wallet | Re-quote and retry |
| Deposit succeeds but fill times out | Across refund mechanism kicks in | Funds returned to origin chain | Automatic -- refund tx issued to depositor |
| Relayer fills on wrong amount | SpokePool contract enforces exact amounts | Cannot happen -- contract-level guarantee | N/A |

### Key Guarantee: No Permanent Fund Loss

At every stage, funds are either:
1. Still in the user's wallet (pre-bridge), or
2. Locked in the SpokePool contract with an automatic refund path (post-deposit, pre-fill), or
3. Delivered to the destination address (post-fill)

The SpokePool contract enforces this at the protocol level. There is no state where user funds are irrecoverably stuck.

### Quote Expiry

Quotes include a `quoteExpiryTimestamp` field. If the user delays (e.g., slow wallet confirmation), the calldata will revert on-chain. The correct pattern:

1. Fetch quote immediately before presenting the "confirm" button.
2. If more than ~30 seconds pass without user confirmation, re-fetch.
3. If the on-chain tx reverts, re-fetch and retry -- user funds have not moved.

### Fill Timeout

If a relayer does not fill the deposit within the timeout window, the deposit transitions to `expired` status. The depositor can then claim a refund on the origin chain. The `/deposit/status` endpoint returns `depositRefundTxHash` when this occurs.

---

## 5. Production Considerations

### This Demo Runs on Mainnet

The working code in this repository executes on Base and Arbitrum mainnet. The Across Swap API (`https://app.across.to/api`) is the production endpoint -- there is no separate staging environment for the API. The Coinbase Onramp component uses the production CDP token flow.

### Cost Structure

Across fees are a function of route, token, and amount. The API calculates fees automatically.

| Amount | Typical Fee (ETH, Base->Arb) | Fee % | Fill Time |
|---|---|---|---|
| 0.001 ETH (~$3) | ~0.000005 ETH | ~0.5% | ~2s |
| 0.1 ETH (~$300) | ~0.0003 ETH | ~0.3% | ~2s |
| 1 ETH (~$3,000) | ~0.002 ETH | ~0.2% | ~2s |
| 100 ETH (~$300K) | ~0.1 ETH | ~0.1% | ~2-5s |

Fees decrease as a percentage at higher volumes. The fee response is deterministic per quote -- display it to the user before confirmation.

### Settlement Mechanisms (Automatic, No Config Required)

The API selects the optimal settlement path per deposit. This is transparent to the integrator.

| Mechanism | When Used | Speed |
|---|---|---|
| **Intents** | Most deposits <$1M | ~2s |
| **CCTP V2** | Native USDC, large amounts | ~15-30s |
| **OFT** | USDT0 (Tether's omnichain token) | ~15-30s |

### Scaling Recommendations

For production integration at Coinbase volume:

- **Batch quoting:** Pre-fetch quotes for popular routes (Base->Arb, Base->OP, Base->Polygon) when user enters the buy flow. Quotes are cheap GET requests.
- **Approval caching:** For ERC-20 tokens, cache approval status per user/token pair. Approvals persist until revoked.
- **Webhook recommendation:** The current API requires polling `/deposit/status`. For high-throughput integrations, we recommend discussing a webhook/event stream for fill notifications to eliminate polling overhead.
- **Integrator ID:** Register for an integrator ID at [across.to](https://across.to) for priority support, analytics, and rate limit increases.

### API Authentication

The Swap API currently does not require an API key for basic usage. For production volume:

1. Register as an integrator at across.to
2. Pass `integrator=yourIntegratorId` as a query parameter
3. This unlocks analytics dashboards and dedicated support

---

## 6. Future Extensions

### Multi-Chain Destination (Available Now)

The same API call works for any of 23+ supported destination chains. Changing `destinationChainId` is the only modification needed. This means Coinbase Onramp could offer a chain selector at purchase time:

```
"Where do you want your ETH?"
  [ Base ]  [ Arbitrum ]  [ Optimism ]  [ Polygon ]  [ zkSync ]  ...
```

Every option uses the same API, same calldata structure, same tracking endpoint.

### Embedded Crosschain Actions

Across supports encoding arbitrary contract calls on the destination chain into the bridge transaction. A single deposit on the origin chain can:

- Bridge ETH to Arbitrum **and** deposit it into Aave
- Bridge USDC to Optimism **and** swap it to WETH on Uniswap
- Bridge to any chain **and** execute any contract call

This enables "buy and deploy" flows: user purchases ETH on Coinbase and it arrives already staked, already in a LP position, or already swapped to a destination token.

### Deposit Addresses for Recurring Flows

For users with recurring buys, Across can provide deterministic deposit addresses that automatically bridge incoming funds to a configured destination chain. This eliminates the per-transaction quote step entirely for repeat flows.

### Partner Fee Margin

The Across API supports two parameters for partner monetization:

```typescript
const query = new URLSearchParams({
  // ... standard params ...
  appFee: "50",                                    // basis points (0.5%)
  appFeeRecipient: "0xYourCoinbaseRevenueAddress",  // receives fee on dest chain
});
```

This adds a transparent fee on top of the Across protocol fee, paid by the user and routed directly to the partner's address on the destination chain. No invoicing, no settlement -- the fee arrives atomically with the bridged funds.

---

## Appendix: Quick Start

Clone the demo repository and run the full flow (requires a funded wallet and Coinbase CDP API keys):

```bash
npm install
cp .env.example .env   # Add PRIVATE_KEY, COINBASE_API_KEY_ID, COINBASE_API_KEY_SECRET
npm run full-flow       # Fiat -> Coinbase -> Base -> Across -> Arbitrum
```

Individual steps can be run independently:

```bash
npm run quote           # Get a bridge quote (read-only, no funds moved)
npm run bridge          # Execute a bridge (requires funded wallet)
npm run track <txHash>  # Track a deposit by transaction hash
npm run onramp          # Generate a Coinbase Onramp URL
```

---

*For integration support, contact the Across solutions engineering team. We offer dedicated Slack channels for production partners.*
