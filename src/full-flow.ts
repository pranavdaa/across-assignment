import { createPublicClient, http, formatEther } from "viem";
import { base, arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  PRIVATE_KEY,
  COINBASE_API_KEY_ID,
  COINBASE_API_KEY_SECRET,
  CHAINS,
  TOKENS,
} from "./config.js";
import { CoinbaseOnrampProvider, waitForBalance } from "./onramp/coinbase.js";
import { executeBridge } from "./across/bridge.js";
import { trackDeposit } from "./across/track.js";

const BRIDGE_AMOUNT = "400000000000000"; // 0.0004 ETH (~$1)

async function main() {
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY not set in .env");
    process.exit(1);
  }
  if (!COINBASE_API_KEY_ID || !COINBASE_API_KEY_SECRET) {
    console.error("COINBASE_API_KEY_ID and COINBASE_API_KEY_SECRET must be set in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletAddress = account.address;

  const baseClient = createPublicClient({
    chain: base,
    transport: http(CHAINS.base.rpcUrl),
  });
  const arbClient = createPublicClient({
    chain: arbitrum,
    transport: http(CHAINS.arbitrum.rpcUrl),
  });

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Coinbase Onramp → Across Bridge → Arbitrum (Full Flow)    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Wallet:      ${walletAddress}`);
  console.log(`  Origin:      Base (${CHAINS.base.id})`);
  console.log(`  Destination: Arbitrum (${CHAINS.arbitrum.id})`);
  console.log(`  Token:       ETH`);
  console.log(`  Amount:      ${formatEther(BigInt(BRIDGE_AMOUNT))} ETH (~$1)\n`);

  // ── Step 1: Record starting balances ─────────────────────────────
  console.log("[1/6] Recording starting balances...");
  const startBaseBalance = await baseClient.getBalance({ address: walletAddress });
  const startArbBalance = await arbClient.getBalance({ address: walletAddress });
  console.log(`  Base:     ${formatEther(startBaseBalance)} ETH`);
  console.log(`  Arbitrum: ${formatEther(startArbBalance)} ETH\n`);

  // ── Step 2: Coinbase Onramp ──────────────────────────────────────
  console.log("[2/6] Onramp: Generating Coinbase buy URL...");
  const onramp = new CoinbaseOnrampProvider(
    COINBASE_API_KEY_ID,
    COINBASE_API_KEY_SECRET
  );

  const { url } = await onramp.generateOnrampUrl({
    walletAddress,
    chainId: CHAINS.base.id,
    chainName: "base",
    asset: "ETH",
    fiatAmount: 1,
    fiatCurrency: "USD",
  });

  const { exec } = await import("child_process");
  exec(`open "${url}"`);
  console.log(`  Opened Coinbase Onramp in browser.`);
  console.log(`  Complete the $1 ETH purchase — script will detect arrival.\n`);

  // ── Step 3: Wait for onramp delivery ─────────────────────────────
  console.log("[3/6] Onramp: Waiting for ETH to arrive on Base...");
  const newBalance = await waitForBalance(walletAddress, startBaseBalance + 1n, 5 * 60 * 1000);
  const received = newBalance - startBaseBalance;
  console.log(`  Received ${formatEther(received)} ETH on Base\n`);

  // ── Step 4: Bridge via Across ────────────────────────────────────
  console.log("[4/6] Bridge: Executing Across bridge (Base → Arbitrum)...");
  const bridgeResult = await executeBridge({
    inputToken: TOKENS.base.eth,
    outputToken: TOKENS.arbitrum.eth,
    originChainId: CHAINS.base.id,
    destinationChainId: CHAINS.arbitrum.id,
    amount: BRIDGE_AMOUNT,
    privateKey: PRIVATE_KEY,
  });
  console.log(`  Deposit tx: ${bridgeResult.depositTxHash}\n`);

  // ── Step 5: Track fill ───────────────────────────────────────────
  console.log("[5/6] Bridge: Tracking deposit fill...");
  const status = await trackDeposit({
    depositTxHash: bridgeResult.depositTxHash,
    originChainId: CHAINS.base.id,
  });

  if (status.status !== "filled") {
    console.error(`  Bridge failed with status: ${status.status}`);
    process.exit(1);
  }
  console.log(`  Fill tx: ${status.fillTxnRef ?? status.fillTx}\n`);

  // ── Step 6: Verify final balances ────────────────────────────────
  console.log("[6/6] Complete: Verifying final balances...");
  const endBaseBalance = await baseClient.getBalance({ address: walletAddress });
  const endArbBalance = await arbClient.getBalance({ address: walletAddress });

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  Flow Complete                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Base ETH:     ${formatEther(startBaseBalance).padEnd(20)} → ${formatEther(endBaseBalance).padEnd(15)}║`);
  console.log(`║  Arbitrum ETH: ${formatEther(startArbBalance).padEnd(20)} → ${formatEther(endArbBalance).padEnd(15)}║`);
  console.log(`║  Bridge fill:  ~${bridgeResult.quote.expectedFillTime}s (Intents)${" ".repeat(30)}║`);
  console.log(`║  Deposit ID:   ${String(status.depositId).padEnd(38)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
}

main().catch((err) => {
  console.error("\nFull flow failed:", err.message);
  process.exit(1);
});
