# Across Senior Solutions Architect Case Study

- [Background](#background)
- [Case Study](#case-study)
- [What We're Looking For](#what-were-looking-for)
- [Submission Guidelines](#submission-guidelines)
- [Evaluation Criteria](#evaluation-criteria)
- [Additional Context](#additional-context)

## Background

Across is leading the future of interoperability with its frontier intents based architecture. Our Swap API, deposit addresses, and other developer surfaces power crosschain bridging, swapping, and embedded actions for a growing set of wallets, exchanges, and stablecoin payments providers. Most of these partners don't consume Across in isolation — they compose us with onramps, offramps, wallet infra, and their own app layer. The Senior Solutions Architect owns the technical partner experience end-to-end, which means being fluent not just in Across but in how Across fits into the rest of the stack a partner is building.

## Case Study

Imagine you've joined Across as our Senior Solutions Architect. Across has just closed a strategic partnership with a real or hypothetical company of your choice — a stablecoin payments provider, wallet, exchange, or similar (think Coinbase, Native Markets / USDH, Meld, Mesh, Bridge.xyz, Circle, MoonPay, or one you invent). You're the technical lead responsible for bringing the integration to life.

Build a working end-to-end stablecoin flow that composes Across with at least one real third-party system/product/API to move value across chains. You pick the flow — a few directions to consider:

- **Onramp → Across → destination chain:** a user arrives with USD, onramps to stablecoin via a provider (e.g., Coinbase CDP Onramp Sandbox, Stripe, MoonPay, Mesh, Meld), then Across lands funds on the destination chain.
- **Source chain → Across → offramp:** a user starts with stablecoin on one chain, Across swaps to USDC on a destination, then offramps via offramp provider.
- **Merchant deposit → treasury settlement:** a merchant's customer deposits on one chain, Across settles funds to the merchant's treasury on another.
- **Something else:** if there's a more interesting flow you want to build, build it.

Use free developer accounts and test modes (Coinbase Onramp Sandbox, Stripe test mode, Circle sandbox, free RPCs, etc.). If any part of the flow requires access you can't get inside a day — business verification, sandbox approval, production API keys — stub it and say so. We care much more about how you reason about the whole system than whether every hop is live. AI tools are strongly encouraged; this is the work the role actually does.

## What We're Looking For

A submission that demonstrates your hands-on technical judgment, your ability to reason across multiple products you don't own, your empathy for the partner engineer's experience, and your instinct for where Across should invest to make flows like this easier to ship.

Deliverables:

- A working integration (code, notebook, repo — runnable if possible, well-annotated if not).
- The pitch you'd use with the partner — slides (~8-12 slides), a structured doc (~3-6 pages), or whatever best supports a 15-minute walkthrough. This is a technical pitch of the solution to the partner team: what each system does, what state lives where, how failure at any hop is detected and handled. Not salesy, but externally-facing and written for someone who needs to ship against it.
- A separate short internal brief for the Across team — your friction log from building this, plus the 2-3 product, docs, or tooling investments you think Across should prioritize based on what you learned. This is for us, not the partner.
- An optional short appendix with architecture diagrams or deeper technical exploration is welcome.

## Use of AI Tools

We view AI and LLM tools as powerful force multipliers, and as core to how this role operates day-to-day. Please use them — they are especially helpful for a case study like this one where you're navigating multiple products' docs and composing unfamiliar APIs. A strong submission uses AI to enhance—rather than replace—your personal judgment and technical intuition, ultimately producing a thoughtful, well-supported artifact that reflects your own reasoning. A short note at the end on how you used them (which tools, what workflow, what you kept vs. rewrote, where the model got it wrong) is welcome.

## Evaluation Criteria

The team will assess your skills in:

1. First principles thinking
2. Hands-on technical fluency
3. Architecture reasoning and reconciliation of how partner and Across systems fit together
4. Partner and developer experience empathy
5. Systems thinking: recognizing which investments compound for future partners vs. point solutions
6. Prioritization: why these investments over others
7. Communication: written clarity and the ability to structure complex multi-product work

## Submission Guidelines

You will have 72 hours to complete this case study from the time you receive this. Please send your submission to melissa@umaproject.org, tessa@umaproject.org and rcarman@umaproject.org when you're done. We'll then have a presentation scheduled for you to present your work to a few members of the Across team – 15 minutes presentation and 45 minutes Q&A. Please reach out to Melissa and Ryan (cc'ing tessa@umaproject.org) if you have any questions.

## Additional Context

1. [Across docs](https://docs.across.to)

We hope this is a fun and informative project, and we really look forward to seeing what you put together.

---

*Please also note, we value the time and effort candidates invest in our interview process, and any work or projects you complete during this process are solely for assessing skills and fit for the role. We do not use candidate work for any business purposes outside of the interview process, ensuring that your contributions are respected and protected.*
