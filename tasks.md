# Execution Tasks

## Task 1: Repo Setup & Tooling ✅
**What:** Initialize the project repo with TypeScript, viem, and a clean folder structure.
**Inputs:** None.
**Expected output:**
- `package.json` with dependencies (`viem`, `typescript`, `tsx`, `dotenv`)
- `tsconfig.json`
- `.env.example` with placeholders (`PRIVATE_KEY`, `ACROSS_API_URL`, `COINBASE_API_KEY`)
- Folder structure: `src/`, `src/across/`, `src/onramp/`, `docs/`
- `.gitignore` (node_modules, .env, dist)
**Dependencies:** None. Start here.
**Status:** Done. Also added `src/config.ts` (shared constants for chains, API URL, env vars) and npm scripts for each step of the flow. Updated config to mainnet (Base + Arbitrum, `app.across.to/api`).

---

## Task 2: Create & Fund Wallet ✅ (testnet) → needs mainnet funding
**What:** Generate a wallet. Fund it with ETH on Base (origin chain for mainnet flow).
**Inputs:** ~$1 of ETH on Base mainnet.
**Expected output:**
- A private key stored in `.env` (never committed)
- Wallet address with confirmed ETH balance on Base
- Console script (`src/check-balance.ts`) that prints balances on both chains
**Dependencies:** Task 1 (repo exists).
**Status:** Wallet `0x16da12e8527f58d390E4d5220c039E8F8Ac4493F` created. Previously funded on testnet. **Needs ~$1 of ETH on Base mainnet** — user will fund via Coinbase Onramp (Task 8) or direct transfer. `check-balance.ts` updated for mainnet chains.

---

## Task 3: Explore Across API ✅
**What:** Make raw API calls to understand request/response shapes, discover token addresses, and identify gaps in the docs.
**Inputs:** `across_docs_complete.md`, Across API base URL.
**Expected output:**
- Confirmed token addresses and supported routes
- Sample `/swap/approval` response
- Sample error responses for the friction log
- Notes on anything surprising or undocumented
**Dependencies:** Task 1 (repo exists to run scripts from).
**Status:** Done. Originally explored testnet API — key findings in `src/across/api-exploration.md`. Mainnet API confirmed working (`app.across.to/api`): ETH Base→Arbitrum route uses Intents (~2s fill), zero approvals needed, rate-limited access works without API key.

---

## Task 4: Build Quote Script ✅
**What:** Write `src/across/quote.ts` — a script that fetches a bridge quote from Across for ETH Base → ETH Arbitrum.
**Inputs:** Mainnet token addresses + chain IDs. Wallet address from Task 2.
**Expected output:**
- Script that calls `GET /swap/approval` with correct params
- Parses and logs: expected output amount, fees, fill time, approval txns needed, quote expiry
- Handles errors gracefully (logs the error response, doesn't crash)
- Exported `getQuote()` function reusable by other scripts
**Dependencies:** Task 2 (wallet address), Task 3 (token addresses).
**Status:** Done. Updated for mainnet. Exports `getQuote()` and typed `AcrossQuote`/`AcrossError` interfaces. ETH route uses Intents (~2s fill), zero approvals needed. Run: `npm run quote`.

---

## Task 5: Build Bridge Execution Script ✅
**What:** Write `src/across/bridge.ts` — a script that executes a bridge transaction using the quote from Task 4.
**Inputs:** `getQuote()` from Task 4. Funded wallet from Task 2.
**Expected output:**
- Loads wallet from private key via viem
- Calls `getQuote()`
- Executes approval txns if present (waits for receipts)
- Executes the swap tx
- Logs the deposit tx hash
- Exported `executeBridge()` function reusable by other scripts
**Dependencies:** Task 4 (quote function), Task 2 (funded wallet).
**Status:** Done. Updated for mainnet — bridge.ts is now chain-agnostic (supports Base or Arbitrum as origin via viem chain registry). Previously tested live on testnet. Awaiting mainnet funding to execute live. Run: `npm run bridge`.

---

## Task 6: Build Deposit Tracker Script ✅
**What:** Write `src/across/track.ts` — a script that polls `/deposit/status` until a deposit is filled.
**Inputs:** A deposit tx hash (from Task 5 output).
**Expected output:**
- Polls `/deposit/status` with the deposit tx hash or origin chain ID + deposit ID
- Exponential backoff: 5s → 10s → 20s → 30s → 30s...
- Logs each status check with timestamp
- On fill: logs the fill tx hash on the destination chain
- Timeout after 5 minutes with clear message
- Exported `trackDeposit()` function reusable by other scripts
**Dependencies:** Task 5 (produces a deposit tx hash to track).
**Status:** Done. Updated for mainnet API. Exports `trackDeposit()`. Mainnet Intents fills expected in ~2s (vs testnet relayer which was unreliable). Run: `npm run track <txHash>`.

---

## Task 7: Research Coinbase CDP Onramp ✅
**What:** Sign up for Coinbase Developer Platform. Determine if the Onramp sandbox supports on-chain token delivery. Understand the integration model (widget, SDK, API).
**Inputs:** Coinbase CDP docs.
**Expected output:**
- Coinbase API key in `.env`
- Clear answer: does the sandbox deliver tokens on-chain?
- Notes on the integration model (widget embed? redirect? API call?)
- Any friction encountered → save for internal brief
**Dependencies:** None. Can run in parallel with Tasks 3-6.
**Status:** Done. Key finding: **Coinbase Onramp sandbox only simulates UI — it does NOT deliver tokens on-chain.** Integration model: `@coinbase/cbpay-js` SDK opens popup/redirect widget. Decision: use **production mode with real money (~$1)** since sandbox is non-functional for e2e testing. API key obtained and in `.env`.

---

## Task 8: Integrate Coinbase Onramp (Production)
**What:** Wire the Coinbase Onramp (production mode) into the flow. User purchases ~$1 of ETH via Coinbase, which delivers real ETH to the wallet on Base.
**Inputs:** Coinbase API key from Task 7. Wallet address from Task 2.
**Expected output:**
- `src/onramp/coinbase.ts` — generates an Onramp URL/session for ETH purchase on Base
- `src/onramp/types.ts` — `OnrampProvider` interface
- Tested: user completes purchase, ETH appears in wallet on Base
- Clear documentation of the production onramp flow
**Dependencies:** Task 7 (confirmed sandbox limitations, production approach chosen).
**Note:** Since Coinbase Onramp is a user-facing widget (popup/redirect), the script generates the URL and waits for ETH balance to appear. The actual purchase is completed by the user in a browser.

---

## Task 9: Build Full Flow Orchestrator
**What:** Write `src/full-flow.ts` — the end-to-end script that chains onramp → quote → bridge → track → verify.
**Inputs:** All modules from Tasks 4-6 and Task 8.
**Expected output:**
- Orchestrates the full flow with clean console output at each step:
  ```
  [1/5] Checking ETH balance on Base...
  [2/5] Bridge: Getting quote from Across (Base → Arbitrum)...
  [3/5] Bridge: Executing bridge transaction...
  [4/5] Bridge: Tracking deposit... (~2s expected fill)
  [5/5] Complete: ETH arrived on Arbitrum
  ```
- Handles errors at each step with clear messages
- Runs end-to-end successfully at least once with real ETH
**Dependencies:** Tasks 4, 5, 6, and 8.

---

## Task 10: Test Runs & Error Documentation
**What:** Run the full flow. Intentionally trigger errors. Document all responses for the friction log.
**Inputs:** Working `full-flow.ts` from Task 9.
**Expected output:**
- 1-2 successful runs with logged output (real mainnet transactions)
- Error test results: bad token address, zero amount, unsupported route, etc. (quote-level only, no wasted gas)
- Timing data: how long did mainnet Intents fills actually take?
- Raw friction notes for Task 13
**Dependencies:** Task 9 (working flow).
**Note:** Since we're using real money, limit test runs. Error testing can be done at the quote level (free API calls) without executing transactions.

---

## Task 11: Write Partner Pitch Document
**What:** Write the external-facing technical pitch for Coinbase's engineering team. 3-6 pages.
**Inputs:** `planning.md` (pitch outline), working code from Tasks 4-9, architecture diagrams.
**Expected output:** `docs/partner-pitch.md` covering:
- Integration overview: what this does, one paragraph + flow diagram
- Architecture: system boundaries, state machine, who owns what
- Implementation guide: Across Swap API usage with code snippets from the demo
- Failure handling: what happens when each hop fails (table format)
- Production considerations: cost structure, scaling patterns, API key setup
- Future extensions: embedded actions, multi-chain, deposit addresses
**Dependencies:** Tasks 9-10 (working code and test results to reference).

---

## Task 12: Create Architecture Diagrams
**What:** Build the visual diagrams for the partner pitch and appendix.
**Inputs:** Architecture from `planning.md`, system boundaries, state machine.
**Expected output:**
- End-to-end flow diagram (Coinbase → Across → destination)
- System boundary diagram (who owns what, where APIs connect)
- Sequence diagram with timing annotations
- Generalization diagram (swap Coinbase for any onramp partner — what changes?)
- Settlement mechanism comparison table (Intents vs. CCTP V2 vs. OFT)
- Format: Mermaid in markdown, or PNG exports if needed for slides
**Dependencies:** Task 9 (finalized architecture from building it). Can overlap with Task 11.

---

## Task 13: Write Internal Brief
**What:** Write the internal-facing brief for the Across team. Friction log + 2-3 investment recommendations.
**Inputs:** Friction notes from Tasks 3, 7, 10. `planning.md` (investment candidates).
**Expected output:** `docs/internal-brief.md` covering:
- Friction log: every pain point in the format "Tried X → Expected Y → Got Z → Means this at scale"
- Investment recommendation 1: Webhook/event stream for fill status (who it unblocks, why now)
- Investment recommendation 2: Onramp reference architecture (compounds across partners)
- Investment recommendation 3: Emerged from actual build friction (TBD — testnet reliability, sandbox limitations, etc.)
- Each recommendation: what to build, who it unblocks, why now, rough effort
**Dependencies:** Task 10 (need real friction data, not hypothetical).

---

## Task 14: Repo Cleanup & README ✅
**What:** Polish the repo so an evaluator can clone and run it.
**Inputs:** All code from Tasks 1-9.
**Expected output:**
- `README.md` with: what this is, how to run it, prerequisites, env setup
- `.env.example` with all required vars
- Clean file structure, no dead code
- All scripts runnable via `npx tsx src/<script>.ts`
**Dependencies:** Task 9 (all code finalized).
**Status:** Done. README.md created with setup instructions, script reference table, project structure, and deliverables section. Code audited — no dead imports, unused files, or test artifacts found. `.env.example` verified with all four required vars. All six npm scripts confirmed in package.json.

---

## Task 15: Presentation Prep
**What:** Structure the 15-minute presentation. Prepare for the 45-minute Q&A.
**Inputs:** `planning.md` (presentation structure + Q&A prep), all deliverables.
**Expected output:**
- Presentation flow mapped to time (minute-by-minute from planning.md)
- Decision to use slides vs. structured doc walkthrough
- Recorded demo run queued as backup
- Written answers to 6-7 likely Q&A questions (from planning.md), rehearsed once
- Confidence in: "Why Coinbase?", "What if relayer doesn't fill?", "How does this scale?", "What did you reject?", "Biggest gap in Across?", "Why mainnet instead of testnet?"
**Dependencies:** Tasks 10-14 (all deliverables complete).

---

## Execution Order

```
Parallel track A (Across):     1 → 2 → 3 → 4 → 5 → 6 ─────┐
Parallel track B (Coinbase):   1 → 7 → 8 ───────────────────┤
                                                             ▼
                                                    9 → 10
                                                     │
                                              ┌──────┼──────┐
                                              ▼      ▼      ▼
                                             11     12     13
                                              │      │      │
                                              └──────┼──────┘
                                                     ▼
                                                    14 → 15
```

Tasks 1-7 complete. Next: Task 8 (Coinbase Onramp production integration), then Task 9 (full flow orchestrator).

**Pivot note:** Originally testnet (Arbitrum Sepolia → Base Sepolia). Pivoted to mainnet (Base → Arbitrum) with real money (~$1 ETH) because: (1) testnet Intents relayer was down, (2) CCTP fills take ~19 min on testnet, (3) Coinbase sandbox doesn't deliver on-chain tokens. Mainnet Intents fills in ~2s.
