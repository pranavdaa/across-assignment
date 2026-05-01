# Across Testnet API Exploration Notes

## Endpoints Tested

### GET /swap/chains
- Returns **mainnet** chains even on testnet API — not testnet chain IDs.
- Friction point: misleading for a developer building on testnet. You'd expect testnet chains.

### GET /swap/tokens?chainId=421614
- Returns testnet tokens correctly.
- USDC on Arbitrum Sepolia: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### GET /available-routes?originChainId=421614&destinationChainId=84532
- Returns correct routes including USDC→USDC, WETH→WETH, USDC→USDbC.
- Clean, predictable response.

### GET /swap/approval (10 USDC quote)
Key findings from the successful quote:
- `crossSwapType`: "bridgeableToBridgeable" — same-token bridge, no DEX swap needed
- `provider`: "cctp" — even at 10 USDC on testnet, it routes through CCTP not Intents
- `fees.total.amount`: "0" — zero fees on this testnet CCTP route
- `expectedFillTime`: 1140 seconds (~19 minutes) — much slower than docs suggest for testnet (~1 min)
- `approvalTxns`: one approval tx (infinite approval to spender `0x8FE6...`)
- `swapTx.simulationSuccess`: true
- `swapTx.gas`: "0" — gas field is zero, need to estimate ourselves or let wallet handle it
- `quoteExpiryTimestamp`: 0 — no expiry on CCTP quotes?
- `checks.allowance`: shows current allowance (0) vs expected (10000000)
- `checks.balance`: shows actual (20000000) vs expected (10000000) — confirms we have enough

### GET /swap/approval (amount=1, tiny amount)
- Does NOT error — returns a valid quote
- Fee is 2038 out of 2044 input (~99.7% fee) — destination gas eats almost everything
- `provider`: "across" (Intents) — different provider than the 10 USDC quote (CCTP)
- `expectedFillTime`: 10 seconds — faster than CCTP route
- The API doesn't have an explicit "amount too low" error — it just returns a quote with absurd fees

### Error Responses
Schema: `{ type: "AcrossApiError", code: string, status: number, message: string, param: string, id: string }`

- Invalid token address → `{ code: "INVALID_PARAM", status: 400, message: "Invalid parameter at path 'inputToken'" }`
- Unsupported chain → `{ code: "INVALID_PARAM", status: 400, message: "Unsupported chain id: 421614" }`

## Surprising Findings

1. **CCTP on testnet for USDC routes** — The 10 USDC quote used CCTP, not Intents. This means testnet fill times are ~19 minutes for USDC-to-USDC, not ~1 minute.
2. **`/swap/chains` returns mainnet chains on testnet** — confusing for developers.
3. **`swapTx.gas` is "0"** — need to handle gas estimation client-side.
4. **`quoteExpiryTimestamp` is 0 for CCTP** — suggests CCTP quotes don't expire (or this field isn't populated on testnet).
5. **No explicit "amount too low" error** — the API returns a valid quote even when fees consume 99%+ of the amount. Partners need to check this themselves.
6. **Different spender addresses per provider** — CCTP route approves to `0x8FE6...` (SpokePoolPeriphery?), Intents route approves to `0x7E63...` (SpokePool). The Swap API handles this, but it's worth noting.
