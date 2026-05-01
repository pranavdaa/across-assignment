# Across Protocol Documentation

> Across Protocol is a crosschain interoperability protocol powering fast, low-cost token transfers across 23+ chains.
> Three settlement mechanisms: Intents (relayer network), CCTP (USDC), and OFT (USDT).
> API base URL: https://app.across.to/api

---

# Table of Contents

## Introduction
- [Welcome to Across](#welcome-to-across)
- [Why Across](#why-across)
- [Key Features](#key-features)
- [API Keys & Integrator ID](#api-keys--integrator-id)
- [Across for Stablecoins](#across-for-stablecoins)
- [Introduction to Swap API](#introduction-to-swap-api)
- [Working with Hypercore](#working-with-hypercore)
- [Embedded Crosschain Actions](#embedded-crosschain-actions)
- [Fees in the System](#fees-in-the-system)
- [Technical FAQ](#technical-faq)

## Guides
- [Concepts](#concepts)
- [Developer Guides](#developer-guides)
- [Migration Guides](#migration-guides)

## AI Agents
- [AI Agents Overview](#ai-agents)

## Tools
- [Tools Overview](#tools)

## API Reference
- [API Reference Overview](#api-reference)

## Chains & Contracts
- [Chains & Contracts](#chains--contracts)

---

# Welcome to Across

Crosschain interoperability with ~2 second fills across 23+ chains.

## What is Across?

Across is a **crosschain interoperability protocol** that provides the fastest, cheapest, and most secure way to move assets across blockchains. With ~2 second fills on mainnet and support for 23+ chains, Across powers crosschain swaps, bridges, and embedded actions through a single unified API.

Unlike single-mechanism bridges, Across intelligently routes through **three distinct settlement pathways** to optimize for speed, cost, and transfer size.

The Swap API automatically selects the optimal pathway — you don't need to choose.

**API key required for production.** Request your API key and integrator ID or reach out on Telegram (https://t.me/acrosstg).

## Quick Start

Get a crosschain swap executing in three steps:

### Get a Quote

Call the Swap API with your transfer parameters to get executable calldata.

```typescript
const params = new URLSearchParams({
  tradeType: "minOutput",
  originChainId: "42161",        // Arbitrum
  destinationChainId: "8453",    // Base
  inputToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC on Arbitrum
  outputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  amount: "1000000000",          // 1000 USDC (6 decimals)
  depositor: "0xYourWalletAddress",
  integratorId: "0xdead",        // Your integrator ID
});

const response = await fetch(
  `https://app.across.to/api/swap/approval?${params}`,
  {
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
    },
  }
);
const quote = await response.json();
```

### Approve Token Spending

If the quote includes approval transactions, execute them first.

```typescript
import { createWalletClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const walletClient = createWalletClient({
  account,
  chain: arbitrum,
  transport: http(),
});

if (quote.approvalTxns?.length) {
  for (const approvalTx of quote.approvalTxns) {
    const hash = await walletClient.sendTransaction({
      to: approvalTx.to,
      data: approvalTx.data,
    });
    console.log("Approval tx:", hash);
  }
}
```

### Execute the Swap

Send the main swap transaction using the calldata from the quote.

```typescript
const hash = await walletClient.sendTransaction({
  to: quote.swapTx.to,
  data: quote.swapTx.data,
  value: quote.swapTx.value ? BigInt(quote.swapTx.value) : 0n,
  gas: quote.swapTx.gas ? BigInt(quote.swapTx.gas) : undefined,
});

console.log("Swap tx:", hash);
// Funds arrive on Base in ~2 seconds
```

## Direct Route Linking

Link users directly to a pre-filled bridge route on the Across UI — no API calls needed:

```
https://app.across.to/bridge-and-swap?from=8453&to=42161&inputToken=BAL&outputToken=USDC
```

---

# Why Across

Why Across is the fastest, cheapest, and most secure crosschain interoperability protocol.

## Speed

Across delivers **sub-2-second fills** on mainnet through a competitive relayer network. Relayers front capital on the destination chain, so users don't wait for finality or message passing.

## Cost

Across's aggregated settlement model (O(1) cost per bundle, not per fill) keeps fees low. The protocol batches all fills into a single settlement bundle every ~1.5 hours, amortizing gas costs across all users.

## Security

Across has had **zero security exploits** since launch. The security model combines:

- **Optimistic verification** with UMA's Optimistic Oracle — bundles are accepted unless challenged
- **Economic bonds** — proposers stake capital that can be slashed for invalid bundles
- **Only one honest actor needed** — a single honest dispute is enough to reject a bad bundle
- **V4 ZK proofs** — Succinct/SP1 zero-knowledge proofs provide cryptographic settlement verification

## Settlement Innovation

Three distinct settlement mechanisms optimize for different transfer types:

| Mechanism | Best For | Key Advantage |
| --- | --- | --- |
| **Intents** | Most transfers | ~2 second fills via relayer competition |
| **CCTP V2 / CCTPFast** | Large USDC (up to $10M) | No relayer capital needed, native USDC |
| **OFT** | USDT0 transfers | Native mint-and-burn, no wrapped tokens |

## Chain Coverage

**23+ mainnet chains** and **8 testnet chains**, including first-mover support for Solana, MegaETH, Plasma, Monad, and Hyperliquid (HyperCore + HyperEVM).

## Integration Simplicity

One API call to bridge across any supported chain. The Swap API handles mechanism selection, token routing and swaps, gas estimation, and approval transaction generation. Just call `/swap/approval` and execute the returned calldata.

---

# Key Features

## Three Settlement Mechanisms

Across is unique in offering three independent settlement pathways. The Swap API automatically selects the optimal mechanism for each transfer.

### Intents — Relayer Network
Sub-2-second fills via a competitive relayer network that fronts capital on the destination chain. The default pathway for most transfers.

### CCTP V2 / CCTPFast — Native USDC
Circle's Crosschain Transfer Protocol for native USDC mint-and-burn. Supports transfers up to $10M per transaction with no relayer capital required.

### OFT — Native USDT0
LayerZero's Omnichain Fungible Token standard for native USDT0 settlement. More OFT tokens coming soon.

## Feature Highlights

| Feature | Details |
| --- | --- |
| **Sub-2-second fills** | Competitive relayer network delivers funds on the destination chain in ~2 seconds on mainnet |
| **23+ mainnet chains** | Solana, MegaETH, Plasma, Monad, Hyperliquid, and all major L2s |
| **CCTP V2 / CCTPFast** | Native USDC settlement up to $10M per transaction |
| **Sponsored routes** | Zero-fee transfers on select routes (e.g., USDC to USDH on Hyperliquid) |
| **Embedded crosschain actions** | Compose DeFi operations — swap, bridge, and execute destination-chain calls in a single transaction |
| **OFT for USDT0** | Native USDT0 mint-and-burn settlement via LayerZero |
| **ERC-7683 standard** | Implements the crosschain intent standard for interoperability |
| **V4 ZK proofs** | Succinct/SP1 zero-knowledge proofs enable permissionless chain expansion |

## Chain Coverage

Across supports **23+ mainnet chains** including:

- **EVM L2s** — Arbitrum, Optimism, Base, Polygon, zkSync, Linea, Scroll, Blast, Mode, Redstone, Zora, and more
- **Alt-L1s and new chains** — Solana, MegaETH, Plasma, Monad
- **App-specific chains** — Hyperliquid (HyperCore + HyperEVM)
- **Testnet support** — 8 testnet chains for development

## Sponsored Routes

Certain routes are **zero-fee** — the protocol or partners subsidize the transfer cost. For example, USDC to USDH on Hyperliquid is a sponsored route with no bridge fee.

## Embedded Crosschain Actions

Bridge and execute in one transaction. Attach arbitrary contract calls to your crosschain transfer — the MulticallHandler executes them atomically on the destination chain.

Use cases: Swap + deposit into Aave, Bridge + add liquidity to a DEX, Transfer + stake on the destination chain.

## ERC-7683

Across implements the ERC-7683 crosschain intent standard, enabling interoperability with other intent-based protocols and standardized order formats.

## V4 — ZK-Powered Expansion

Across V4 introduces zero-knowledge proofs via Succinct's SP1 prover for settlement verification, enabling permissionless chain expansion, faster settlement, and reduced trust assumptions.

---


# API Keys & Integrator ID

How to get an API key and integrator ID for production use of the Across APIs.

## What Are They?

Production use of Across requires two credentials:

| Credential | What it is | How it's used |
| --- | --- | --- |
| **API Key** | Authentication token for API requests | Passed in the `Authorization` header on every API call |
| **Integrator ID** | Unique 2-byte hex identifier (e.g., `0xdead`) | Passed as a query parameter (`integratorId`) in API calls, or appended to calldata for direct contract integration |

Both are required for production. Without them, your requests may be rate-limited or rejected.

## How to Request

**Request your API key and integrator ID** by reaching out on [Telegram](https://t.me/acrosstg).

## Using with the Swap API

```typescript
const params = new URLSearchParams({
  tradeType: "minOutput",
  originChainId: "42161",
  destinationChainId: "8453",
  inputToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  outputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "1000000000",
  depositor: "0xYourWalletAddress",
  integratorId: "0xdead",  // Your 2-byte hex integrator ID
});

const response = await fetch(
  `https://app.across.to/api/swap/approval?${params}`,
  {
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
    },
  }
);
```

## Using with Direct Contract Integration

If you're calling `depositV3` on the SpokePool directly (via the `suggested-fees` API):

- **API key** — `Authorization` header on the `/suggested-fees` API call
- **Integrator ID** — appended to the `depositV3` transaction **calldata** (not as a query parameter)

### Appending Integrator ID to Calldata

Append a **delimiter** (`1dc0de`) followed by your **integrator ID** to the end of the encoded `depositV3` calldata:

| Component | Value | Description |
| --- | --- | --- |
| **Delimiter** | `1dc0de` | Fixed 3-byte hex string that marks the start of the identifier |
| **Integrator ID** | Your assigned ID (e.g., `f001`) | Unique identifier provided by the Across team |

```
...0000000000000000000000000000000000000000000000000000000000000000  // last param
1dc0def001  // ← delimiter (1dc0de) + integrator ID (f001)
```

**Do NOT** pass the delimiter + identifier to any `depositV3` parameter, including the `message` param. Only append it to the raw calldata of the transaction.

```typescript
import { encodeFunctionData, type Hex } from "viem";

const DELIMITER = "1dc0de";
const INTEGRATOR_ID = "f001";  // Replace with your assigned ID

const calldata = encodeFunctionData({
  abi: spokePoolAbi,
  functionName: "depositV3",
  args: [depositor, recipient, inputToken, outputToken, inputAmount,
         outputAmount, destinationChainId, exclusiveRelayer,
         quoteTimestamp, fillDeadline, exclusivityDeadline, message],
});

const calldataWithId = `${calldata}${DELIMITER}${INTEGRATOR_ID}` as Hex;

const hash = await walletClient.sendTransaction({
  to: spokePoolAddress,
  data: calldataWithId,
});
```

## Testnet vs Production

| Environment | Base URL | API Key Required? |
| --- | --- | --- |
| **Testnet** | `https://testnet.across.to/api` | No |
| **Production** | `https://app.across.to/api` | Yes |

## Rate Limits

Without a valid API key, production requests are subject to strict rate limits. If you're seeing `429 Too Many Requests` errors, verify your API key is included and valid.

## Integrator ID Format

The integrator ID is a **2-byte hex string** prefixed with `0x` when used as a query parameter:

```
0xdead    ✓  Valid
0x0001    ✓  Valid
0xffff    ✓  Valid
dead      ✗  Missing 0x prefix
0xdeadbeef ✗  Too long (4 bytes)
```

When appending to calldata, use raw hex without the `0x` prefix.

---

# Across for Stablecoins

Native USDC, USDT0, and USDH transfers using CCTP V2, OFT, and sponsored settlement mechanisms.

Across supports three independent settlement mechanisms for stablecoins: **intents** (relayer network), **CCTP V2** (native USDC), and **OFT** (native USDT0).

## Settlement Comparison

| Property | Intents | CCTP V2 / CCTPFast | OFT |
| --- | --- | --- | --- |
| **Token** | Any supported | USDC | USDT0 |
| **Speed** | ~2 seconds | Varies (attestation dependent) | Varies (message dependent) |
| **Max amount** | Relayer capacity | $10M | Varies |
| **Relayer capital?** | Yes | No | No |
| **Settlement** | Relayer fills, bundled repayment | Circle mint-and-burn | LayerZero mint-and-burn |

## CCTP V2 — Native USDC Settlement

Circle's Crosschain Transfer Protocol V2 enables native USDC mint-and-burn across chains. **CCTPFast** is available on select routes, offering faster attestation times.

Key properties:
- Transfers up to **$10 million** per transaction
- No relayer capital required
- Native USDC on the destination (not bridged/wrapped)

### Flow: Initiate Transfer → Origin Burn → Destination Mint

## OFT — Native USDT0 Settlement

For USDT0 transfers, Across uses the LayerZero Omnichain Fungible Token (OFT) standard — burns USDT0 on origin and mints natively on destination.

### Flow: Initiate Transfer → Origin Burn → Destination Mint

## Sponsored Routes

Certain stablecoin routes are **zero-fee**. Currently sponsored: **USDC → USDH** on Hyperliquid.

## Stablecoin Contract Addresses

### USDC
| Chain | Address |
| --- | --- |
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |

### USDT0
| Chain | Address |
| --- | --- |
| Ethereum | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Arbitrum | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| Optimism | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |

Use `/swap/tokens?chainId=<id>` for the complete list.

## Supported Chains per Stablecoin

| Chain | USDC | USDT0 | USDH |
| --- | --- | --- | --- |
| Ethereum | Yes | Yes | — |
| Arbitrum | Yes | Yes | — |
| Base | Yes | — | — |
| Optimism | Yes | Yes | — |
| Polygon | Yes | — | — |
| Hyperliquid | — | — | Yes |
| Solana | Yes | — | — |

---

# Introduction to Swap API

The Swap API is Across's **single entry point** for all crosschain operations — bridging, swapping, and embedded actions. It abstracts the three settlement mechanisms behind one unified interface at `/swap/approval`.

## Trade Types

The `tradeType` parameter controls how the swap amount is interpreted.

### exactInput
Spend exactly this amount, receive whatever the market gives.
```
tradeType=exactInput&amount=1000000000
```

### minOutput
Receive at least this amount, spend whatever is needed. **Recommended default.**
```
tradeType=minOutput&amount=1000000000
```

### exactOutput
Receive exactly this amount.
```
tradeType=exactOutput&amount=1000000000&strictTradeType=true
```

## Base URLs

| Environment | Base URL |
| --- | --- |
| Production | `https://app.across.to/api` |
| Testnet | `https://testnet.across.to/api` |

Testnet fills take ~1 minute vs ~2 seconds on mainnet.

## Required Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tradeType` | `string` | `exactInput`, `minOutput`, or `exactOutput` |
| `amount` | `string` | Amount in smallest unit (e.g., `1000000` = 1 USDC) |
| `inputToken` | `string` | Token address on origin chain |
| `outputToken` | `string` | Token address on destination chain |
| `originChainId` | `number` | Origin chain ID |
| `destinationChainId` | `number` | Destination chain ID |
| `depositor` | `string` | Wallet address initiating the transfer |

## Optional Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `recipient` | `string` | Destination address (defaults to `depositor`) |
| `integratorId` | `string` | 2-byte hex identifier for your integration |
| `slippage` | `string` | `"auto"` or a value between 0-1 (default: auto) |
| `refundAddress` | `string` | Address for refunds if fill expires |
| `refundOnOrigin` | `boolean` | Refund on origin chain instead of destination |
| `appFee` | `string` | Integrator fee as decimal 0-1 (e.g., `"0.01"` = 1%) |
| `appFeeRecipient` | `string` | Address to receive integrator fees |
| `skipOriginTxEstimation` | `boolean` | Skip gas estimation for the origin transaction |
| `strictTradeType` | `boolean` | Fail if exact trade type can't be satisfied |
| `excludeSources` | `string` | Comma-separated swap sources to exclude |
| `includeSources` | `string` | Comma-separated swap sources to include exclusively |

## Response Structure

```json
{
  "crossSwapType": "bridgeableToBridgeable",
  "checks": {
    "allowance": { "token": "0x...", "spender": "0x...", "actual": "0", "expected": "1000000" },
    "balance": { "token": "0x...", "actual": "5000000", "expected": "1000000" }
  },
  "approvalTxns": [
    { "chainId": 42161, "to": "0x...", "data": "0x..." }
  ],
  "steps": {
    "bridge": { "inputAmount": "1000000", "outputAmount": "998000" }
  },
  "fees": {
    "total": "2000",
    "totalMax": "3000",
    "originGas": "50000"
  },
  "swapTx": {
    "simulationSuccess": true,
    "chainId": 42161,
    "to": "0x...",
    "data": "0x...",
    "value": "0",
    "gas": "250000",
    "maxFeePerGas": "100000000",
    "maxPriorityFeePerGas": "1500000"
  },
  "expectedFillTime": 2,
  "quoteExpiryTimestamp": 1700000000
}
```

**Key fields:**
- **`crossSwapType`** — Routing path: `bridgeableToBridgeable`, `bridgeableToBridgeableIndirect`, `bridgeableToAny`, `anyToBridgeable`, or `anyToAny`
- **`checks`** — Current allowance and balance status for the depositor
- **`approvalTxns`** — Token approval transactions to execute before the swap
- **`swapTx`** — The main swap transaction calldata
- **`expectedFillTime`** — Estimated seconds until the destination fill
- **`quoteExpiryTimestamp`** — Unix timestamp when this quote expires

## Helper Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/swap/chains` | GET | List all supported chains |
| `/swap/tokens` | GET | List all supported tokens per chain |
| `/swap/sources` | GET | List swap providers (DEX sources) |
| `/suggested-fees` | GET | Get fee breakdown for a specific route |
| `/limits` | GET | Get transfer limits (min, max, instant, short-delay) |
| `/available-routes` | GET | Get all available origin → destination routes |

**Do not cache** `/swap/approval` or `/suggested-fees` responses. Quotes expire quickly.

---


# Working with Hypercore

Bridge assets to Hyperliquid's sub-second settlement layer via Across.

HyperCore is Hyperliquid's high-performance trading layer with sub-second settlement. Across supports bridging assets directly to HyperCore via the Swap API.

## Key Parameters

| Parameter | Value | Notes |
| --- | --- | --- |
| `destinationChainId` | `1337` | HyperEVM chain ID |
| `outputToken` | USDC-SPOT address | The USDC-SPOT token on HyperEVM |

HyperCore uses Chain ID **1337** (HyperEVM). The Swap API handles the routing from HyperEVM to HyperCore automatically.

## How It Works

1. **Origin Deposit** — User deposits assets on origin chain via Swap API
2. **HyperEVM Fill** — A relayer fills the intent on HyperEVM
3. **HyperCore Credit** — Funds are automatically credited to the user's HyperCore account (auto-initialized if needed)

---

# Embedded Crosschain Actions

Execute custom on-chain operations on the destination chain immediately after a crosschain swap.

Embedded crosschain actions let you compose arbitrary destination-chain operations — token transfers, DeFi deposits, contract calls — into a single crosschain transaction via the Swap API.

## How It Works

1. **Submit Intent with Actions** — Call `POST /swap/approval` with an `actions` array
2. **Relayer Includes Message** — The relayer fills the intent with the encoded message
3. **SpokePool Executes Actions** — The MulticallHandler contract executes your actions atomically

## Action Object Schema

```json
{
  "target": "0x...",
  "functionSignature": "function transfer(address to, uint256 value)",
  "args": [
    {
      "value": "0x...",
      "populateDynamically": false
    },
    {
      "value": "0",
      "populateDynamically": true,
      "balanceSourceToken": "0x..."
    }
  ],
  "value": "0",
  "isNativeTransfer": false,
  "populateCallValueDynamically": false
}
```

### Field Reference

| Field | Type | Description |
| --- | --- | --- |
| `target` | `string` | Contract or recipient address on the destination chain |
| `functionSignature` | `string` | Solidity function signature. Empty string for native transfers |
| `args` | `array` | Ordered array of function arguments |
| `args[].value` | `string` | Argument value |
| `args[].populateDynamically` | `boolean` | If `true`, actual token balance at execution time replaces this value |
| `args[].balanceSourceToken` | `string` | Token address whose balance to inject. `0x0000...0000` for native ETH |
| `value` | `string` | Static `msg.value` in wei |
| `isNativeTransfer` | `boolean` | If `true`, this is a simple ETH transfer |
| `populateCallValueDynamically` | `boolean` | If `true`, entire native balance used as `msg.value` |

## API Request Format

Embedded actions use the `POST` method on `/swap/approval`:

```typescript
const response = await fetch(
  `https://app.across.to/api/swap/approval?${params}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer YOUR_API_KEY",
    },
    body: JSON.stringify({
      actions: [
        {
          target: "0x...",
          functionSignature: "function transfer(address,uint256)",
          args: [
            { value: "0xRecipient", populateDynamically: false },
            { value: "0", populateDynamically: true, balanceSourceToken: "0x..." },
          ],
          value: "0",
          isNativeTransfer: false,
          populateCallValueDynamically: false,
        },
      ],
    }),
  }
);
```

The `recipient` parameter should be set to the **MulticallHandler** contract address on the destination chain.

---

# Fees in the System

How LP fees, relayer fees, gas fees, and capital fees are calculated in Across.

Every crosschain transfer through Across incurs fees split between liquidity providers and relayers.

## Fee Breakdown

```
totalFee = inputAmount - outputAmount
```

| Fee Type | Recipient | Purpose |
| --- | --- | --- |
| **LP Fee** | Liquidity providers | Compensates LPs for capital utilization and rebalancing risk |
| **Relayer Fee** | Relayer who fills the intent | Covers gas costs, capital opportunity cost, and risk |

## LP Fees

Across uses a **utilization-based pricing model** adapted from Aave. LP fees depend on pool utilization.

- Low utilization → minimal fees
- Above a "kink" threshold → fees increase steeply

The annualized rate formula follows an Aave-style two-slope model:
```
R(U) = R0 + (min(U-bar, U) / U-bar) * R1 + (max(0, U - U-bar) / (1 - U-bar)) * R2
```

**When are LP fees zero?** If the relayer takes repayment on the origin chain, no crosschain rebalancing is needed.

## Relayer Fees

Relayers are compensated for three costs:

1. **Gas Fees** — Cost of fill transaction on the destination chain
2. **Capital Opportunity Cost** — Time value of locked capital (~1.5 hours)
3. **Capital at Risk** — Software bugs, chain reorgs, settlement delays

## Querying Fees

```typescript
const params = new URLSearchParams({
  inputToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  outputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  originChainId: "42161",
  destinationChainId: "8453",
  amount: "1000000000",
});

const res = await fetch(`https://app.across.to/api/suggested-fees?${params}`);
const fees = await res.json();
```

### Fee Response Fields

| Field | Description |
| --- | --- |
| `totalRelayFee` | Combined LP + relayer fee |
| `lpFee` | LP fee component (pct format: 1e16 = 1%) |
| `relayerCapitalFee` | Relayer capital opportunity cost |
| `relayerGasFee` | Relayer destination gas cost |
| `isAmountTooLow` | `true` if below minimum for this route |
| `expectedFillTimeSec` | Estimated fill time |
| `limits` | Min/max deposit amounts |

---

# Technical FAQ

### Should I use the API versus the App SDK to integrate Across?
### What is the behavior of ETH / WETH in transfers?
### How do I deposit using ETH instead of WETH?
### While bridging, funds got deducted from my wallet on origin chain but I haven't received them on destination chain yet.
### What is the recommended fillDeadline to be used while making a deposit to the Across SpokePool contracts?

---

# Guides

Concepts, developer guides, and migration references for Across Protocol.

## Concepts

Core concepts behind Across Protocol's crosschain architecture:

- **What are Crosschain Intents?** — How intent-based bridging differs from traditional bridges
- **Intent Architecture in Across** — Hub-and-spoke model with HubPool on Ethereum and SpokePools on each chain
- **Intent Lifecycle in Across** — Step-by-step flow from deposit to fill to settlement
- **What is Across V4?** — ZK proofs, permissionless chain expansion via Succinct SP1
- **ERC-7683 in Production** — The crosschain intent order standard in production on Across

## Developer Guides

- **Integrate Across Swap API** — Build a complete crosschain USDC bridge from scratch using viem
- **Crosschain Deposit into Aave** — Bridge USDC from Arbitrum to Ethereum, swap to ETH, deposit into Aave — all in a single transaction

## User Guides

- **Direct Route Linking** — Link users to pre-filled bridge routes using URL query parameters

## Migration Guides

- **Solana Migration** — API changes, deposit flow, and relayer updates for USDC on Solana
- **V2 to V3 Migration** — New events, functions, fee structure, contract changes
- **CCTP Migration** — Transition from Bridged USDC to Native USDC via CCTP
  - CCTP Migration for API Users
  - CCTP Migration for Relayers
- **Non-EVM and Prefills** — Support non-EVM chains and deterministic relay hashes
  - Breaking Changes for API Users
  - Breaking Changes for Indexers
  - Breaking Changes for Relayers
  - Testnet Environment
- **BNB Smart Chain** — Enable BNB Smart Chain (Chain ID 56) bridging

---

# AI Agents

Give your AI agent crosschain superpowers with a single command.

## Add Across to your agent with one command

```bash
npx skills add https://github.com/across-protocol/skills --yes
```

Compatible with **Claude Code**, **Codex**, **Cursor**, **Openclaw**, and more.

## Connect to the Across MCP Server

```
https://mcp.across.to/mcp
```

Add this URL to any MCP-compatible client.

### What your agent gets

- **Bridge tokens** across 23+ chains with natural language commands
- **Get live quotes** — fees, estimated fill times, and optimal routes
- **Execute crosschain swaps** — USDC, USDT, WETH, and more
- **Track deposits** — check fill status and confirmations in real time
- **Compose embedded actions** — bridge + swap + deposit into DeFi in one transaction

### Supported Agents

| Agent Framework | Status |
| --- | --- |
| Claude Code | Supported |
| Codex | Supported |
| Cursor | Supported |
| Openclaw | Supported |

### Two ways to connect

| Approach | Best for | Setup |
| --- | --- | --- |
| **Skills CLI** | Claude Code, Codex, Cursor, Openclaw | One command install |
| **MCP Server** | Claude Desktop, Cursor, Windsurf, VS Code Copilot, Codex | Point client at `https://mcp.across.to/mcp` |

### Supported Chains (26 mainnet)

| Chain | Chain ID | Chain | Chain ID |
| --- | --- | --- | --- |
| Ethereum | 1 | Arbitrum | 42161 |
| Optimism | 10 | Base | 8453 |
| Polygon | 137 | BNB Smart Chain | 56 |
| zkSync | 324 | Linea | 59144 |
| Scroll | 534352 | Blast | 81457 |
| Mode | 34443 | Lisk | 1135 |
| Zora | 7777777 | Ink | 57073 |
| Unichain | 130 | Soneium | 1868 |
| World Chain | 480 | Lens | 232 |
| Lighter | 2337 | Tempo | 4217 |
| HyperCore | 1337 | HyperEVM | 999 |
| MegaETH | 4326 | Monad | 143 |
| Plasma | 9745 | Solana | 34268394551451 |

### AI Agent Sub-pages

- **MCP Server** — Search docs, query chains, get live bridge fees from any MCP client
- **Machine-Readable Docs** — llms.txt endpoints for AI agents and RAG pipelines
- **AGENTS.md** — Drop-in AGENTS.md template for repos integrating Across
- **Prompt Library** — Curated prompts for discovery, quoting, execution, tracking, and DeFi composition
- **Agent Workflows** — End-to-end examples of real agent sessions

---

# Tools

Tools and utilities for working with Across Protocol.

- **Status Tracker** — Track the lifecycle of any Across deposit by transaction hash or deposit ID
- **Token Checker** — Check if Across supports your token across all chains
- **Chain Checker** — Check if Across supports your chain by ID or name
- **Transaction Builder** — Build crosschain swap + action requests for the Across API

---

# API Reference

Complete API reference for the Across Protocol.

## Server URLs

| Environment | Base URL |
| --- | --- |
| Production | `https://app.across.to/api` |

## Authentication

All API requests require a Bearer token via the `Authorization` header.

## Endpoints

### Early Access

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/swap/counterfactual` | Generate a counterfactual deposit address. Arbitrum origin only, HyperEVM/HyperCore destination. |

### Swap API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/swap/approval` | Get swap approval data (quote + calldata) |
| POST | `/swap/approval` | Build embedded crosschain swap actions |
| GET | `/swap/chains` | Get supported chains |
| GET | `/swap/tokens` | Get supported tokens |
| GET | `/swap/sources` | Get supported swap sources |

### Tracking Deposits

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/deposit` | Get all details for a single deposit (by `depositTxnRef`, `depositId`+`originChainId`, or `relayDataHash`) |
| GET | `/deposit/status` | Track the lifecycle of a deposit (fill status + fill tx hash) |
| GET | `/deposits` | Get all deposits for a given depositor |

Note: Deposit tracking endpoints have ~1-15 second latency after deposit submission due to internal indexing.

### Suggested Fees API (Legacy)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/suggested-fees` | Retrieve suggested fee quote for a deposit |
| GET | `/available-routes` | Retrieve available routes for transfers |
| GET | `/limits` | Retrieve current transfer limits |

---


# Chains & Contracts

Deployed contract addresses for all supported Across chains.

## Mainnet Chains (Live on Swap API)

| Chain | Chain ID | SpokePool | SpokePoolPeriphery | MulticallHandler |
| --- | --- | --- | --- | --- |
| Ethereum | 1 | `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Arbitrum | 42161 | `0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Base | 8453 | `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Blast | 81457 | `0x2D509190Ed0172ba588407D4c2df918F955Cc6E1` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| BNB Smart Chain | 56 | `0x4e8E101924eDE233C13e2D8622DC8aED2872d505` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| HyperEVM | 999 | `0x35E63eA3eb0fb7A3bc543C71FB66412e1F6B0E04` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x5E7840E06fAcCb6d1c3b5F5E0d1d3d07F2829bba` |
| Ink | 57073 | `0xeF684C38F94F48775959ECf2012D7E864ffb9dd4` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Lens | 232 | `0xb234cA484866c811d0e6D3318866F583781ED045` | `0x5a148a9260c1f670429361c34d40b477280F01a9` | `0x1Ed0D59019a52870337b51DEe8190486a8663037` |
| Linea | 59144 | `0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0xdF1C940487574EEfa79989a79a4936A0F979cDa2` |
| Lisk | 1135 | `0x9552a0a6624A23B848060AE5901659CDDa1f83f8` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| MegaETH | 4326 | `0x3Db06DA8F0a24A525f314eeC954fC5c6a973d40E` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0xFfc1285082deAB9bf0ECA5699e4930bb310aFbE4` |
| Mode | 34443 | `0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Monad | 143 | `0xd2ecb3afe598b746F8123CaE365a598DA831A449` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0xeC41F75c686e376Ab2a4F18bde263ab5822c4511` |
| Optimism | 10 | `0x6f26Bf09B1C792e3228e5467807a900A503c0281` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Plasma | 9745 | `0x50039fAEfebef707cFD94D6d462fE6D10B39207a` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x5E7840E06fAcCb6d1c3b5F5E0d1d3d07F2829bba` |
| Polygon | 137 | `0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Scroll | 534352 | `0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Solana | 34268394551451 | `DLv3NggMiSaef97YCkew5xKUHDh13tVGZ7tydt3ZeAru` | — | `HaQe51FWtnmaEcuYEfPA7MRCXKrtqptat4oJdJ8zV5Be` |
| Soneium | 1868 | `0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| Tempo | 4217 | `0x2d4710F04Da90184255782d3715224A6C776955D` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x7D6ADCbB51Ea70C134d7B0B96aA9AF50FE504D90` |
| Unichain | 130 | `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| World Chain | 480 | `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |
| zkSync | 324 | `0xE0B015E54d54fc84a6cB9B666099c46adE9335FF` | `0x5a148a9260c1f670429361c34d40b477280F01a9` | `0x68d3806E57148D6c6793C78EbDDbc272fE605dbf` |
| Zora | 7777777 | `0x13fDac9F9b4777705db45291bbFF3c972c6d1d97` | `0x10D8b8DaA26d307489803e10477De69C0492B610` | `0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E` |

## Testnet Chains

Use testnet API at `https://testnet.across.to/api`. Fills typically take ~1 minute. No API key required.

| Chain | Chain ID | SpokePool |
| --- | --- | --- |
| Arbitrum Sepolia | 421614 | 0x7E63...ee75 |
| Base Sepolia | 84532 | 0x82B5...0F8F |
| Blast Sepolia | 168587773 | 0x5545...f022 |
| BOB Sepolia | 808813 | 0x3baD...Dd96 |
| Lens Sepolia | 37111 | 0x6A0a...967B |
| Lisk Sepolia | 4202 | 0xeF68...9dd4 |
| Mode Sepolia | 919 | 0xbd88...f83b |
| Optimism Sepolia | 11155420 | 0x4e8E...d505 |
| Polygon Amoy | 80002 | 0xd08b...e8e5 |
| Sepolia | 11155111 | 0x5ef6...B662 |
| Solana Devnet | 133268194659241 | JAZWcG...QBiq |
| Tatara | 129399 | 0x09ae...EC64 |
| Unichain Sepolia | 1301 | 0x6999...A874 |

---

# Additional Pages Reference (from llms.txt)

The following pages exist in the Across docs but were not fully scraped above. Visit docs.across.to for complete content:

## Introduction (additional)
- [Actors in the System](/introduction/actors) — Users, relayers, LPs, dataworkers, and UMA oracle
- [Tracking Deposits](/introduction/tracking-deposits) — Monitor crosschain transfer status via API
- [Refunds](/introduction/refunds) — How refunds work when a transfer expires unfilled
- [Deposit Addresses](/introduction/deposit-addresses) — Generate counterfactual deposit addresses
- [Direct Route Linking](/introduction/direct-route-linking) — Link users to pre-filled bridge routes
- [Bug Bounty](/introduction/bug-bounty) — Report vulnerabilities and earn rewards
- [Crosschain Live](/introduction/crosschain-live) — Weekly livestream/podcast

## Embedded Actions (sub-pages)
- [Transfer ERC-20 Tokens After Swap](/introduction/embedded-actions/transfer-erc20)
- [Deposit ETH into Aave](/introduction/embedded-actions/deposit-eth-aave)
- [Add Liquidity to Across HubPool](/introduction/embedded-actions/hubpool-liquidity)
- [Simple Native ETH Transfer](/introduction/embedded-actions/native-eth-transfer)
- [Handling Nested Parameters](/introduction/embedded-actions/nested-parameters)

## Security Model
- [Security Model and Verification](/introduction/security) — Optimistic verification, bonds, UMA oracle
- [Disputing Root Bundles](/introduction/security/disputing-root-bundles)
- [Validating Root Bundles](/introduction/security/validating-root-bundles)

## Relayers
- [Running a Relayer](/introduction/relayers/running-relayer)
- [Relayer Nomination](/introduction/relayers/relayer-nomination)

## Guides - Concepts (full pages)
- [What are Crosschain Intents?](/guides/concepts/crosschain-intents)
- [Intent Architecture in Across](/guides/concepts/intents-architecture)
- [Intent Lifecycle in Across](/guides/concepts/intent-lifecycle)
- [What is Across V4?](/guides/concepts/across-v4)
- [ERC-7683 in Production](/guides/concepts/erc-7683)

## Guides - Developer
- [Integrate Across Swap API](/guides/dev-guides/integrate-swap-api)
- [Crosschain Deposit into Aave](/guides/dev-guides/crosschain-aave-deposit)

## Migration Guides (sub-pages)
- [Solana Migration](/guides/migration/solana)
- [V2 to V3 Migration](/guides/migration/v2-to-v3)
- [CCTP Migration](/guides/migration/cctp) + sub-pages for API users and relayers
- [Non-EVM and Prefills](/guides/migration/non-evm) + sub-pages for API users, indexers, relayers, testnet
- [BNB Smart Chain](/guides/migration/bnb)

## AI Agents (sub-pages)
- [MCP Server](/ai-agents/mcp-server)
- [Machine-Readable Docs](/ai-agents/llms-txt)
- [AGENTS.md](/ai-agents/agents-md)
- [Prompt Library](/ai-agents/prompt-library)
- [Agent Workflows](/ai-agents/agent-examples)

---

*This document was compiled from docs.across.to on April 7, 2026. For the most up-to-date information, visit https://docs.across.to or use their machine-readable docs at https://docs.across.to/llms.txt*
