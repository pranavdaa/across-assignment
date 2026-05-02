# Crosschain Onramp Delivery: Across + Coinbase

**From:** Solutions Architecture, Across Protocol
**To:** Coinbase Onramp Integration Engineering

---

## The Idea

Coinbase Onramp delivers crypto to one chain. With Across as a post-purchase layer, users can receive it on **any chain** — Arbitrum, Optimism, Polygon, zkSync, or 20+ others — without leaving the Coinbase flow.

The bridge is invisible to the user. Funds arrive on the destination chain in **~2 seconds**, at under $0.50 for typical retail amounts.

A working demo of this flow ships with this proposal — running on mainnet with real funds.

### How It Works

```
User buys $50 ETH on Coinbase
        |
        v
Coinbase delivers ETH to Base (origin chain)
        |
        v
Across bridges ETH from Base → user's preferred chain
        |
        v
ETH arrives on Arbitrum in ~2 seconds
```

### Who Owns What

| Responsibility | Owner |
|---|---|
| Fiat payment, KYC, compliance | Coinbase |
| Crypto delivery to origin chain | Coinbase |
| Bridge quote, execution, fill | Across |
| Destination chain delivery | Across relayer network |

---

## Integration Surface

The entire Across integration is **two API calls**. No SDK, no contract interaction, no complex setup.

| Endpoint | Purpose |
|---|---|
| `GET /swap/approval` | Returns a bridge quote + ready-to-execute transaction |
| `GET /deposit/status` | Returns fill status (`pending` → `filled`) |

The `/swap/approval` response includes everything: fees, expected fill time, simulation result, and the exact calldata to submit on-chain. For native ETH, zero token approvals are needed.

Fill tracking is simple — poll `/deposit/status` with the deposit tx hash. Typical Intents fills complete in 2-4 seconds, so the first poll usually returns `filled`.

---

## Failure Handling

At every stage, funds are either in the user's wallet, locked in the contract with a refund path, or delivered to the destination. **There is no state where funds are stuck.**

| What Fails | What Happens | Funds |
|---|---|---|
| Onramp payment fails | Standard Coinbase error flow | Never left fiat |
| Bridge quote fails | ETH sits on Base in user's wallet | Safe on origin chain |
| Bridge tx reverts | ETH stays in wallet | Never left wallet |
| Fill times out | Across refund mechanism kicks in | Returned to origin chain |

---

## Cost & Speed

| Amount | Fee | Fee % | Fill Time |
|---|---|---|---|
| ~$3 | ~$0.01 | ~0.5% | ~2s |
| ~$300 | ~$0.90 | ~0.3% | ~2s |
| ~$3,000 | ~$6 | ~0.2% | ~2s |
| ~$300K | ~$300 | ~0.1% | ~2-5s |

Fees decrease at higher volumes. The API calculates and returns fees per quote — display to user before confirmation.

Settlement is automatic — the API picks the fastest path:

| Mechanism | When | Speed |
|---|---|---|
| **Intents** | Most deposits under $1M | ~2s |
| **CCTP V2** | Large USDC transfers | ~15-30s |
| **OFT** | USDT0 | ~15-30s |

---

## What This Unlocks

**Multi-chain destination** — Same API call, just change the destination chain ID. Coinbase could offer a chain selector at purchase time: "Where do you want your ETH?"

**Buy-and-deploy flows** — Across supports encoding contract calls into the bridge. A user could buy ETH on Coinbase and have it arrive already staked, already in an LP position, or already swapped to another token.

**Partner revenue** — The API supports an `appFee` parameter. Coinbase adds a fee (in basis points) that gets routed directly to a Coinbase address on the destination chain. No invoicing, no settlement — it arrives atomically with the bridged funds.

---

## Next Steps

1. Clone the demo repo and run the flow end-to-end
2. Discuss webhook/event stream for fill notifications at scale
3. Register for an integrator ID for analytics and priority support

*For integration support, contact the Across solutions engineering team.*
