import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  type Hash,
  type Chain,
} from "viem";
import { base, arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, CHAINS, TOKENS } from "../config.js";
import { getQuote, type AcrossQuote } from "./quote.js";

const VIEM_CHAINS: Record<number, Chain> = {
  [base.id]: base,
  [arbitrum.id]: arbitrum,
};

export interface BridgeResult {
  depositTxHash: Hash;
  quote: AcrossQuote;
}

export async function executeBridge(params: {
  inputToken: string;
  outputToken: string;
  originChainId: number;
  destinationChainId: number;
  amount: string;
  privateKey: `0x${string}`;
}): Promise<BridgeResult> {
  const account = privateKeyToAccount(params.privateKey);

  const originChainConfig = Object.values(CHAINS).find(
    (c) => c.id === params.originChainId
  );
  if (!originChainConfig) {
    throw new Error(`Unknown origin chain ID: ${params.originChainId}`);
  }

  const viemChain = VIEM_CHAINS[params.originChainId];
  if (!viemChain) {
    throw new Error(`No viem chain definition for chain ID: ${params.originChainId}`);
  }

  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(originChainConfig.rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(originChainConfig.rpcUrl),
  });

  console.log(`\n[Bridge] Getting quote...`);
  const quote = await getQuote({
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    originChainId: params.originChainId,
    destinationChainId: params.destinationChainId,
    amount: params.amount,
    depositor: account.address,
  });

  console.log(
    `[Bridge] Quote received: ${formatEther(BigInt(quote.inputAmount))} ETH → ${formatEther(BigInt(quote.expectedOutputAmount))} ETH`
  );
  console.log(
    `[Bridge] Provider: ${quote.steps.bridge.provider}, fill time: ~${quote.expectedFillTime}s`
  );

  if (!quote.swapTx.simulationSuccess) {
    throw new Error("Quote simulation failed — aborting bridge");
  }

  if (quote.approvalTxns?.length) {
    for (let i = 0; i < quote.approvalTxns.length; i++) {
      const approvalTx = quote.approvalTxns[i];
      console.log(
        `[Bridge] Sending approval tx ${i + 1}/${quote.approvalTxns.length}...`
      );
      const hash = await walletClient.sendTransaction({
        to: approvalTx.to as `0x${string}`,
        data: approvalTx.data as `0x${string}`,
      });
      console.log(`[Bridge] Approval tx sent: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error(`Approval tx reverted: ${hash}`);
      }
      console.log(`[Bridge] Approval confirmed in block ${receipt.blockNumber}`);
    }
  } else {
    console.log(`[Bridge] No approvals needed`);
  }

  console.log(`[Bridge] Sending bridge transaction...`);
  const depositTxHash = await walletClient.sendTransaction({
    to: quote.swapTx.to as `0x${string}`,
    data: quote.swapTx.data as `0x${string}`,
    value: quote.swapTx.value ? BigInt(quote.swapTx.value) : 0n,
  });

  console.log(`[Bridge] Deposit tx sent: ${depositTxHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: depositTxHash,
  });

  if (receipt.status === "reverted") {
    throw new Error(`Bridge tx reverted: ${depositTxHash}`);
  }

  console.log(`[Bridge] Deposit confirmed in block ${receipt.blockNumber}`);
  console.log(`[Bridge] Gas used: ${receipt.gasUsed}`);

  return { depositTxHash, quote };
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const result = await executeBridge({
    inputToken: TOKENS.base.eth,
    outputToken: TOKENS.arbitrum.eth,
    originChainId: CHAINS.base.id,
    destinationChainId: CHAINS.arbitrum.id,
    amount: "500000000000000", // 0.0005 ETH (~$1)
    privateKey: PRIVATE_KEY,
  });

  console.log(`\n--- Bridge Complete ---`);
  console.log(`  Deposit tx: ${result.depositTxHash}`);
  console.log(`  Use this tx hash to track the fill with: npm run track`);
}

const isMainModule = process.argv[1]?.endsWith("across/bridge.ts");
if (isMainModule) {
  main().catch((err) => {
    console.error("Bridge failed:", err.message);
    process.exit(1);
  });
}
