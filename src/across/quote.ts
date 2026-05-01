import { formatEther } from "viem";
import { ACROSS_API_URL, PRIVATE_KEY, CHAINS, TOKENS } from "../config.js";
import { privateKeyToAccount } from "viem/accounts";

export interface AcrossQuote {
  crossSwapType: string;
  approvalTxns: Array<{ chainId: number; to: string; data: string }>;
  swapTx: {
    simulationSuccess: boolean;
    chainId: number;
    to: string;
    data: string;
    value: string;
    gas: string;
  };
  steps: {
    bridge: {
      inputAmount: string;
      outputAmount: string;
      provider: string;
      fees: { amount: string; pct: string };
    };
  };
  fees: {
    total: { amount: string; pct: string };
  };
  inputAmount: string;
  expectedOutputAmount: string;
  expectedFillTime: number;
  quoteExpiryTimestamp: number;
  id: string;
}

export interface AcrossError {
  type: "AcrossApiError";
  code: string;
  status: number;
  message: string;
  param?: string;
  id: string;
}

export async function getQuote(params: {
  inputToken: string;
  outputToken: string;
  originChainId: number;
  destinationChainId: number;
  amount: string;
  depositor: string;
}): Promise<AcrossQuote> {
  const query = new URLSearchParams({
    tradeType: "minOutput",
    originChainId: String(params.originChainId),
    destinationChainId: String(params.destinationChainId),
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    amount: params.amount,
    depositor: params.depositor,
  });

  const url = `${ACROSS_API_URL}/swap/approval?${query}`;
  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok || body.type === "AcrossApiError") {
    const err = body as AcrossError;
    throw new Error(`Across API error [${err.code}]: ${err.message}`);
  }

  return body as AcrossQuote;
}

function printQuote(quote: AcrossQuote) {
  const provider = quote.steps.bridge.provider;
  const inputAmt = formatEther(BigInt(quote.inputAmount));
  const outputAmt = formatEther(BigInt(quote.expectedOutputAmount));
  const bridgeFee = quote.steps.bridge.fees.amount;
  const fillTime = quote.expectedFillTime;
  const approvals = quote.approvalTxns?.length ?? 0;
  const simOk = quote.swapTx.simulationSuccess;

  console.log(`\n--- Across Bridge Quote ---`);
  console.log(`  Route:        Base → Arbitrum`);
  console.log(`  Token:        ETH`);
  console.log(`  Provider:     ${provider}`);
  console.log(`  Input:        ${inputAmt} ETH`);
  console.log(`  Output:       ${outputAmt} ETH`);
  console.log(`  Bridge fee:   ${formatEther(BigInt(bridgeFee))} ETH`);
  console.log(`  Fill time:    ~${fillTime}s`);
  console.log(`  Approvals:    ${approvals} tx(s) needed`);
  console.log(`  Simulation:   ${simOk ? "passed" : "FAILED"}`);
  console.log(`  Quote ID:     ${quote.id}`);
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Wallet: ${account.address}`);

  const quote = await getQuote({
    inputToken: TOKENS.base.eth,
    outputToken: TOKENS.arbitrum.eth,
    originChainId: CHAINS.base.id,
    destinationChainId: CHAINS.arbitrum.id,
    amount: "500000000000000", // 0.0005 ETH (~$1)
    depositor: account.address,
  });

  printQuote(quote);
}

const isMainModule = process.argv[1]?.endsWith("across/quote.ts");
if (isMainModule) {
  main().catch((err) => {
    console.error("Quote failed:", err.message);
    process.exit(1);
  });
}
