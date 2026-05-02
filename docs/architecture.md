# Architecture: Coinbase Onramp + Across Bridge

A simple end-to-end flow: **Fiat USD → Coinbase Onramp → ETH on Base → Across Bridge → ETH on Arbitrum**

---

## 1. End-to-End Flow

```mermaid
flowchart LR
    A["User\n(Browser)"] -- "$1 USD" --> B["Coinbase\nOnramp"]
    B -- "ETH on Base" --> C["User Wallet\n(Base)"]
    C -- "Bridge tx" --> D["Across\nSwap API"]
    D -- "~2s fill" --> E["User Wallet\n(Arbitrum)"]

    style A fill:#1B1C21,color:#E0E0E0,stroke:#3E4047
    style B fill:#1652f0,color:#fff,stroke:#1652f0
    style C fill:#2D2E33,color:#6CF9D8,stroke:#6CF9D8
    style D fill:#6CF9D8,color:#1B1C21,stroke:#6CF9D8
    style E fill:#2D2E33,color:#9B7DFF,stroke:#9B7DFF
```

---

## 2. Sequence Diagram

Shows the actual API calls made by the app.

```mermaid
sequenceDiagram
    participant UI as Next.js UI
    participant CB as Coinbase CDP
    participant Base as Base Chain
    participant Across as Across API
    participant Arb as Arbitrum Chain

    UI->>CB: POST /onramp/v1/token (JWT auth)
    CB-->>UI: Session token + onramp URL
    UI->>UI: Open Coinbase widget in popup
    Note right of CB: User buys $1 ETH<br/>with fiat (card/bank)

    CB->>Base: Deliver ETH to wallet

    loop Poll every 5s
        UI->>Base: Check ETH balance (viem)
    end
    Base-->>UI: Balance increased

    UI->>Across: GET /swap/approval (Base→Arbitrum, ETH)
    Across-->>UI: Quote + transaction calldata

    UI->>Base: Submit bridge tx (viem)
    Base-->>UI: Tx confirmed

    Note over Across,Arb: Across relayer fills<br/>the order (~2s)

    loop Poll every 3s
        UI->>Across: GET /deposit/status
    end
    Across-->>UI: Status: filled

    Note over UI,Arb: ETH now on Arbitrum
```

---

## 3. App Architecture

```mermaid
flowchart TB
    subgraph frontend["Next.js Frontend"]
        PAGE["page.tsx\n(React UI)"]
    end

    subgraph api["API Routes"]
        ONRAMP["/api/onramp\nGenerates Coinbase\nsession + URL"]
        BALANCES["/api/balances\nReads ETH balances\non both chains"]
        BRIDGE["/api/bridge\nGets Across quote\n+ submits tx"]
        STATUS["/api/status\nPolls Across\ndeposit status"]
    end

    subgraph external["External Services"]
        CB["Coinbase CDP API"]
        ACROSS["Across Swap API"]
        BASE_RPC["Base RPC"]
        ARB_RPC["Arbitrum RPC"]
    end

    PAGE --> ONRAMP
    PAGE --> BALANCES
    PAGE --> BRIDGE
    PAGE --> STATUS

    ONRAMP --> CB
    BALANCES --> BASE_RPC
    BALANCES --> ARB_RPC
    BRIDGE --> ACROSS
    BRIDGE --> BASE_RPC
    STATUS --> ACROSS

    style frontend fill:#2D2E33,stroke:#3E4047,color:#E0E0E0
    style api fill:#2D2E33,stroke:#6CF9D8,color:#E0E0E0
    style external fill:#1B1C21,stroke:#3E4047,color:#6C7284
```

---

## Rendering

All diagrams use [Mermaid](https://mermaid.js.org/) and render natively on GitHub, in VS Code (with Mermaid extension), or at [mermaid.live](https://mermaid.live).
