# Architecture Diagrams: Coinbase Onramp + Across Protocol

These diagrams document the architecture for composing Coinbase Onramp (fiat-to-crypto) with Across Protocol's crosschain bridge to achieve a seamless fiat-to-any-chain flow.

**Proven flow:** Fiat USD -> Coinbase Onramp (production) -> ETH on Base -> Across mainnet bridge (Intents, ~2s fill) -> ETH on Arbitrum

---

## 1. End-to-End Flow Diagram

Shows the full journey from fiat purchase through crosschain delivery.

```mermaid
flowchart LR
    subgraph User
        A["User (Browser / Script)"]
    end

    subgraph "Coinbase Domain"
        B["Coinbase Onramp\n(Fiat Collection + KYC)"]
        C["Crypto Delivery\n(ETH on Base)"]
    end

    subgraph "Base Chain"
        D["User Wallet\n(ETH Balance)"]
        E["Base SpokePool\n(Across Contract)"]
    end

    subgraph "Across Domain"
        F["Swap API\n(/swap/allowance\n /swap/approval\n /swap/quote)"]
        G["Relayer Network\n(Intent Matching)"]
    end

    subgraph "Arbitrum Chain"
        H["Arbitrum SpokePool\n(Across Contract)"]
        I["Destination Wallet\n(ETH on Arbitrum)"]
    end

    A -- "1. Initiate purchase\n(USD amount)" --> B
    B -- "2. Process payment\n~1 min" --> C
    C -- "3. Deliver ETH" --> D
    D -- "4. Get quote +\napproval tx" --> F
    F -- "5. Return calldata" --> D
    D -- "6. Submit deposit tx" --> E
    E -- "7. Emit V3FundsDeposited\nevent" --> G
    G -- "8. Fill order\n~2s" --> H
    H -- "9. Deliver ETH" --> I

    style A fill:#e1f5fe
    style B fill:#fff3e0
    style C fill:#fff3e0
    style D fill:#e8f5e9
    style E fill:#e8f5e9
    style F fill:#f3e5f5
    style G fill:#f3e5f5
    style H fill:#fce4ec
    style I fill:#fce4ec
```

---

## 2. System Boundary Diagram

Three integration domains with clear API boundaries between them.

```mermaid
flowchart TB
    subgraph coinbase_domain["Coinbase Domain"]
        direction TB
        CO_FIAT["Fiat Collection\n(Card / Bank / Apple Pay)"]
        CO_KYC["KYC / Compliance"]
        CO_DELIVERY["Crypto Delivery Engine"]
        CO_WEBHOOK["Webhook / Status Callback"]

        CO_FIAT --> CO_KYC --> CO_DELIVERY
        CO_DELIVERY --> CO_WEBHOOK
    end

    subgraph across_domain["Across Domain"]
        direction TB
        AC_SWAP["Swap API\n(REST: /swap/*)"]
        AC_STATUS["Status API\n(/deposit/status)"]
        AC_RELAYER["Relayer Network\n(Off-chain Intent Matching)"]
        AC_SETTLEMENT["Settlement Layer\n(Optimistic Verification)"]

        AC_SWAP --> AC_RELAYER
        AC_RELAYER --> AC_SETTLEMENT
        AC_STATUS -.- AC_RELAYER
    end

    subgraph blockchain_domain["Blockchain Domain"]
        direction TB
        BASE_RPC["Base RPC\n(JSON-RPC)"]
        BASE_SPOKE["Base SpokePool\n(0x09aea...Base)"]
        ARB_RPC["Arbitrum RPC\n(JSON-RPC)"]
        ARB_SPOKE["Arbitrum SpokePool\n(0x09aea...Arb)"]

        BASE_RPC --> BASE_SPOKE
        ARB_RPC --> ARB_SPOKE
    end

    coinbase_domain -- "API Boundary 1\nCoinbase Onramp SDK\n(HTTPS + redirect URL)" --> blockchain_domain
    blockchain_domain -- "API Boundary 2\nAcross Swap API\n(REST over HTTPS)" --> across_domain
    across_domain -- "API Boundary 3\nSpokePool Contracts\n(On-chain tx submission)" --> blockchain_domain

    style coinbase_domain fill:#fff3e0,stroke:#e65100
    style across_domain fill:#f3e5f5,stroke:#6a1b9a
    style blockchain_domain fill:#e8f5e9,stroke:#2e7d32
```

---

## 3. Sequence Diagram with Timing

Full request/response flow with timing annotations on each interaction.

```mermaid
sequenceDiagram
    participant User as User / Script
    participant CB as Coinbase Onramp
    participant Base as Base Chain
    participant API as Across Swap API
    participant Relayer as Across Relayer
    participant Arb as Arbitrum Chain

    Note over User,Arb: Total flow: ~1-2 min (dominated by onramp)

    User->>CB: 1. Initiate purchase (USD amount, dest address)
    activate CB
    Note right of CB: KYC + payment<br/>processing
    CB->>Base: 2. Deliver ETH to wallet on Base
    deactivate CB
    Note right of CB: ~1 min

    User->>Base: 3. Poll for balance arrival
    Base-->>User: Balance confirmed

    User->>API: 4. GET /swap/allowance (check token approval)
    API-->>User: Allowance status
    Note right of API: ~200ms

    opt If allowance insufficient
        User->>API: 5a. GET /swap/approval (get approval calldata)
        API-->>User: Approval transaction calldata
        User->>Base: 5b. Submit approval tx
        Base-->>User: Approval tx confirmed
        Note right of Base: ~2s (Base block)
    end

    User->>API: 6. GET /swap/quote (amount, origin=Base, dest=Arbitrum)
    API-->>User: Quote with deposit calldata + expected fill time
    Note right of API: ~300ms

    User->>Base: 7. Submit deposit tx to SpokePool
    Base-->>User: Tx confirmed, depositId emitted
    Note right of Base: ~2s (Base block)

    Note over Relayer: Relayer detects deposit event

    Relayer->>Arb: 8. Fill order (send ETH to recipient)
    Note right of Relayer: ~2s fill time

    loop Poll for fill status
        User->>API: 9. GET /deposit/status (originChainId, depositId)
        API-->>User: Status: pending / filled
    end
    Note right of API: Polling interval: 2s

    API-->>User: 10. Status: filled (fillTxHash returned)
    Note over User,Arb: Complete: ETH delivered on Arbitrum
```

---

## 4. Generalization Diagram: Pluggable Onramp Interface

Demonstrates that the Across bridge logic is entirely independent of the onramp provider. Swapping Coinbase for another onramp changes only the left side of the architecture.

```mermaid
flowchart TB
    subgraph onramp_interface["Onramp Module (Pluggable)"]
        direction TB

        IF["OnrampProvider Interface\n---\ninitiatePurchase(amount, token, chain)\npollDelivery(address, chain)\ngetStatus(sessionId)"]

        subgraph providers["Implementations"]
            direction LR
            CB["Coinbase Onramp\n(Production)\n---\nSDK: @coinbase/onramp\nKYC: Built-in\nFiat: Card, Bank, Apple Pay\nSettlement: ~1 min"]
            MP["MoonPay\n---\nSDK: @moonpay/sdk\nKYC: Built-in\nFiat: Card, Bank\nSettlement: ~2-5 min"]
            ST["Stripe Crypto\n---\nSDK: stripe-onramp\nKYC: Stripe Identity\nFiat: Card\nSettlement: ~1-3 min"]
            ME["Meld\n---\nSDK: @meld/sdk\nKYC: Delegated\nFiat: Card, Bank\nSettlement: ~2-5 min"]
        end

        IF --> CB
        IF --> MP
        IF --> ST
        IF --> ME
    end

    subgraph bridge_core["Across Bridge Core (Unchanged)"]
        direction TB
        QUOTE["1. Get Quote\nGET /swap/quote"]
        APPROVE["2. Check/Set Allowance\nGET /swap/allowance\nGET /swap/approval"]
        DEPOSIT["3. Submit Deposit\nSpokePool.depositV3()"]
        POLL["4. Poll Fill Status\nGET /deposit/status"]
        QUOTE --> APPROVE --> DEPOSIT --> POLL
    end

    subgraph chains["Destination Chains"]
        direction LR
        ARB["Arbitrum"]
        OP["Optimism"]
        ETH_MAIN["Ethereum"]
        POLY["Polygon"]
        ZK["zkSync"]
    end

    onramp_interface -- "ETH / USDC delivered\non origin chain\n(e.g. Base)" --> bridge_core
    bridge_core -- "Assets delivered\non destination chain\n~2s fill" --> chains

    style onramp_interface fill:#fff3e0,stroke:#e65100
    style bridge_core fill:#f3e5f5,stroke:#6a1b9a
    style chains fill:#e8f5e9,stroke:#2e7d32
    style CB fill:#1652f0,color:#fff
    style MP fill:#7d00ff,color:#fff
    style ST fill:#635bff,color:#fff
    style ME fill:#00c2a8,color:#fff
```

**Key insight:** The `OnrampProvider` interface abstracts fiat-to-crypto delivery. Any provider that can deliver tokens to a specified address on a supported origin chain can plug into this architecture. The Across bridge logic (quote, approve, deposit, poll) remains 100% identical regardless of onramp provider.

---

## 5. Settlement Mechanism Comparison

Across Protocol auto-selects the optimal settlement mechanism based on the token and route. The Swap API abstracts this entirely from the integrator.

### Comparison Table

| Dimension | Intents (Default) | CCTP V2 (Circle) | OFT (LayerZero) |
|---|---|---|---|
| **Mechanism** | Relayer fronts capital on destination, reimbursed later via optimistic verification | Native USDC mint/burn via Circle attestation | Burn token on source, mint on destination via LayerZero messaging |
| **Fill Speed** | ~2 seconds | ~15-20 minutes | ~2-5 minutes |
| **Token Support** | ETH, WETH, USDC, USDT, DAI, WBTC, and more | USDC only | USDT0 (OFT-wrapped USDT) |
| **Volume Sweet Spot** | < $1M per transfer (relayer capital constrained) | > $1M USDC (no capital constraint, native settlement) | Any size USDT0 (burn/mint, no capital needed) |
| **Capital Requirement** | Relayer must have capital on destination chain | None (mint/burn) | None (burn/mint) |
| **Finality Model** | Optimistic: assume valid, challenge window for disputes | Attestation: Circle signs off-chain, mint on destination | Messaging: LayerZero oracle + relayer confirm |
| **Who Bears Risk** | Relayer (fronts capital, reimbursed after verification) | Circle (attestation delay = security window) | LayerZero validators |
| **Auto-Selection** | Default for most tokens and routes | Auto-selected for large USDC transfers where speed is less critical | Auto-selected when bridging USDT0 between OFT-supported chains |

### Settlement Selection Flow

```mermaid
flowchart TD
    A["User calls GET /swap/quote\n(token, amount, routes)"] --> B{"What token?"}

    B -- "USDT0" --> C{"OFT route\navailable?"}
    C -- "Yes" --> D["Use OFT\n(LayerZero burn/mint)\n~2-5 min"]
    C -- "No" --> E["Fall back to Intents"]

    B -- "USDC" --> F{"Amount > $1M?"}
    F -- "Yes" --> G["Use CCTP V2\n(Circle mint/burn)\n~15-20 min"]
    F -- "No" --> E

    B -- "ETH / WETH / DAI\nWBTC / Other" --> E["Use Intents\n(Relayer fill)\n~2s"]

    style A fill:#e1f5fe
    style D fill:#fff3e0
    style E fill:#f3e5f5
    style G fill:#e8f5e9
```

**Note:** The integrator never chooses a settlement mechanism. The Across Swap API auto-selects the optimal path based on token, amount, and route. This is fully abstracted from the caller -- you get the same API interface regardless of which mechanism is used under the hood.

---

## 6. State Machine Diagram

Complete state machine for the onramp-to-bridge flow, including all failure and recovery transitions.

```mermaid
stateDiagram-v2
    [*] --> INITIATED: User starts flow

    INITIATED --> ONRAMPING: Coinbase session created
    ONRAMPING --> ONRAMP_COMPLETE: ETH detected on Base
    ONRAMPING --> ONRAMP_FAILED: Payment declined /<br/>KYC failed / timeout

    ONRAMP_COMPLETE --> QUOTING: Request Across quote
    QUOTING --> APPROVING: Quote received,<br/>approval needed
    QUOTING --> BRIDGING: Quote received,<br/>already approved
    QUOTING --> QUOTE_FAILED: API error /<br/>no route / insufficient liquidity

    APPROVING --> BRIDGING: Approval tx confirmed
    APPROVING --> TX_REVERTED: Approval tx reverted

    BRIDGING --> PENDING_FILL: Deposit tx confirmed,<br/>depositId emitted
    BRIDGING --> TX_REVERTED: Deposit tx reverted

    PENDING_FILL --> FILLED: Relayer fills on Arbitrum<br/>(~2s typical)
    PENDING_FILL --> FILL_TIMEOUT: No fill after timeout<br/>(10 min threshold)

    FILLED --> COMPLETE: Fill tx hash confirmed
    COMPLETE --> [*]

    %% Failure states
    ONRAMP_FAILED --> INITIATED: Retry purchase
    ONRAMP_FAILED --> [*]: User abandons

    QUOTE_FAILED --> QUOTING: Retry quote
    QUOTE_FAILED --> [*]: User abandons

    TX_REVERTED --> QUOTING: Re-quote and retry
    TX_REVERTED --> [*]: User abandons

    FILL_TIMEOUT --> REFUNDED: Slow fill refund<br/>on origin chain
    REFUNDED --> [*]: Funds returned to user on Base

    note right of INITIATED
        Entry point: user selects
        amount and destination chain
    end note

    note right of ONRAMPING
        Coinbase handles KYC,
        payment, and delivery.
        ~1 min typical.
    end note

    note right of PENDING_FILL
        Across relayer monitoring
        for deposit events.
        ~2s typical fill.
    end note

    note right of FILL_TIMEOUT
        If no relayer fills within timeout,
        Across settlement guarantees
        refund on origin chain after
        challenge window.
    end note

    note right of REFUNDED
        User receives original tokens
        back on Base. Can retry
        or withdraw.
    end note
```

### State Descriptions

| State | Description | Next (Happy Path) | Failure Transition |
|---|---|---|---|
| `INITIATED` | User has started the flow, parameters collected | `ONRAMPING` | -- |
| `ONRAMPING` | Coinbase Onramp session active, payment processing | `ONRAMP_COMPLETE` | `ONRAMP_FAILED` |
| `ONRAMP_COMPLETE` | ETH balance detected on Base wallet | `QUOTING` | -- |
| `QUOTING` | Fetching quote from Across Swap API | `APPROVING` or `BRIDGING` | `QUOTE_FAILED` |
| `APPROVING` | Submitting token approval transaction | `BRIDGING` | `TX_REVERTED` |
| `BRIDGING` | Submitting deposit transaction to SpokePool | `PENDING_FILL` | `TX_REVERTED` |
| `PENDING_FILL` | Deposit confirmed, waiting for relayer fill | `FILLED` | `FILL_TIMEOUT` |
| `FILLED` | Relayer has filled on destination chain | `COMPLETE` | -- |
| `COMPLETE` | Terminal success state | -- | -- |
| `ONRAMP_FAILED` | Coinbase payment/KYC failure | Retry -> `INITIATED` | Abandon |
| `QUOTE_FAILED` | Across API error or no available route | Retry -> `QUOTING` | Abandon |
| `TX_REVERTED` | On-chain transaction reverted | Retry -> `QUOTING` | Abandon |
| `FILL_TIMEOUT` | No relayer fill within timeout window | `REFUNDED` | -- |
| `REFUNDED` | Funds returned to user on origin chain | Terminal | -- |

---

## Rendering Notes

All diagrams use [Mermaid](https://mermaid.js.org/) syntax. They render natively in:
- GitHub markdown (README, issues, PRs)
- VS Code with the Mermaid extension
- Notion (with Mermaid embed block)
- Any Mermaid Live Editor: [https://mermaid.live](https://mermaid.live)

To preview locally, install the VS Code extension `bierner.markdown-mermaid`.
