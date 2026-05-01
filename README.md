# Coinbase Onramp + Across Protocol Bridge Integration

A working integration demo that composes Coinbase Onramp (fiat-to-crypto) with Across Protocol's crosschain bridge. Built as a case study for the Senior Solutions Architect role at Across Protocol.

**Proven flow:** Fiat USD → Coinbase Onramp → ETH on Base → Across bridge (Intents, ~2s fill) → ETH on Arbitrum

This runs on mainnet with real funds. Transactions are small (~$1 of ETH).

## Prerequisites

- Node.js 20+
- npm
- A Coinbase Developer Platform account with Onramp API keys
- A funded wallet (the onramp script handles this)

## Setup

```bash
git clone <repo-url> && cd across-coinbase-onramp-bridge
npm install
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Wallet private key (hex, with 0x prefix) |
| `COINBASE_API_KEY_ID` | Coinbase CDP API key ID |
| `COINBASE_API_KEY_SECRET` | Coinbase CDP API key secret (base64) |

`ACROSS_API_URL` defaults to `https://app.across.to/api` and can be left as-is.

## Scripts

| Command | What it does |
|---|---|
| `npm run onramp` | Generate a Coinbase Onramp URL and open it in the browser for ETH purchase on Base |
| `npm run check-balance` | Check ETH, WETH, and USDC balances on Base and Arbitrum |
| `npm run quote` | Get a bridge quote from Across (Base → Arbitrum, 0.0005 ETH) |
| `npm run bridge` | Execute a bridge transaction (Base → Arbitrum) |
| `npm run track -- <txHash>` | Track a deposit by tx hash until filled |
| `npm run full-flow` | End-to-end: onramp → detect funds → bridge → track → verify balances |

## Project Structure

```
src/
  config.ts              # Shared config: chains, tokens, env vars
  check-balance.ts       # Multi-chain balance checker
  full-flow.ts           # End-to-end orchestrator
  across/
    quote.ts             # Across Swap API quote fetcher
    bridge.ts            # Bridge transaction executor
    track.ts             # Deposit status poller
    api-exploration.md   # API exploration notes from build process
  onramp/
    coinbase.ts          # Coinbase Onramp URL/session generator
    types.ts             # OnrampProvider interface
docs/
  partner-pitch.md       # External pitch for Coinbase engineering team
  internal-brief.md      # Internal brief: friction log + investment recommendations
  architecture.md        # Architecture diagrams (Mermaid)
```

## Deliverables

- **[Partner Pitch](docs/partner-pitch.md)** — Technical proposal for Coinbase's integration engineering team. Covers architecture, implementation guide, failure handling, and production considerations.
- **[Internal Brief](docs/internal-brief.md)** — Friction log from building the integration, plus three investment recommendations for the Across product/engineering team.
- **[Architecture Diagrams](docs/architecture.md)** — End-to-end flow, system boundaries, sequence diagram, and settlement mechanism comparison.

## Note on Mainnet Usage

This demo uses Base and Arbitrum mainnet (not testnet). The pivot to mainnet was deliberate:
- Coinbase Onramp sandbox does not deliver tokens on-chain
- Across testnet Intents relayer was unreliable during development
- Mainnet Intents fills complete in ~2 seconds vs. ~19 minutes for testnet CCTP

All transactions use small amounts (~$1 of ETH). See `src/across/api-exploration.md` for testnet findings.
