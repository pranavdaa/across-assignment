import { NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, ACROSS_API_URL, CHAINS, TOKENS } from "@/lib/config";

export async function POST(req: Request) {
  const { amount } = (await req.json()) as { amount: string };
  const account = privateKeyToAccount(PRIVATE_KEY);

  // Get quote
  const query = new URLSearchParams({
    tradeType: "minOutput",
    originChainId: String(CHAINS.base.id),
    destinationChainId: String(CHAINS.arbitrum.id),
    inputToken: TOKENS.base.eth,
    outputToken: TOKENS.arbitrum.eth,
    amount,
    depositor: account.address,
  });

  const quoteRes = await fetch(`${ACROSS_API_URL}/swap/approval?${query}`);
  const quote = await quoteRes.json();

  if (!quoteRes.ok || quote.type === "AcrossApiError") {
    return NextResponse.json({ error: quote.message || "Quote failed" }, { status: 400 });
  }

  if (!quote.swapTx.simulationSuccess) {
    return NextResponse.json({ error: "Quote simulation failed — insufficient balance?" }, { status: 400 });
  }

  // Execute bridge
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(CHAINS.base.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAINS.base.rpcUrl),
  });

  // Approvals (if any)
  if (quote.approvalTxns?.length) {
    for (const approvalTx of quote.approvalTxns) {
      const hash = await walletClient.sendTransaction({
        to: approvalTx.to as `0x${string}`,
        data: approvalTx.data as `0x${string}`,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }

  // Deposit
  const depositTxHash = await walletClient.sendTransaction({
    to: quote.swapTx.to as `0x${string}`,
    data: quote.swapTx.data as `0x${string}`,
    value: quote.swapTx.value ? BigInt(quote.swapTx.value) : 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

  if (receipt.status === "reverted") {
    return NextResponse.json({ error: "Bridge transaction reverted" }, { status: 500 });
  }

  return NextResponse.json({
    depositTxHash,
    inputAmount: formatEther(BigInt(quote.inputAmount)),
    expectedOutput: formatEther(BigInt(quote.expectedOutputAmount)),
    fillTime: quote.expectedFillTime,
    provider: quote.steps.bridge.provider,
    gasUsed: receipt.gasUsed.toString(),
  });
}
