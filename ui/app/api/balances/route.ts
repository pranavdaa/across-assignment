import { NextResponse } from "next/server";
import { createPublicClient, http, formatEther } from "viem";
import { base, arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, CHAINS } from "@/lib/config";

let cachedEthPrice: { usd: number; ts: number } | null = null;

async function getEthPrice(): Promise<number> {
  if (cachedEthPrice && Date.now() - cachedEthPrice.ts < 60_000) {
    return cachedEthPrice.usd;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const data = await res.json();
    const usd = data.ethereum.usd as number;
    cachedEthPrice = { usd, ts: Date.now() };
    return usd;
  } catch {
    return cachedEthPrice?.usd ?? 0;
  }
}

export async function GET() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  const baseClient = createPublicClient({ chain: base, transport: http(CHAINS.base.rpcUrl) });
  const arbClient = createPublicClient({ chain: arbitrum, transport: http(CHAINS.arbitrum.rpcUrl) });

  const [baseBalance, arbBalance, ethPrice] = await Promise.all([
    baseClient.getBalance({ address: account.address }),
    arbClient.getBalance({ address: account.address }),
    getEthPrice(),
  ]);

  const baseEth = formatEther(baseBalance);
  const arbEth = formatEther(arbBalance);

  return NextResponse.json({
    wallet: account.address,
    ethPrice,
    base: { wei: baseBalance.toString(), eth: baseEth, usd: (parseFloat(baseEth) * ethPrice).toFixed(2) },
    arbitrum: { wei: arbBalance.toString(), eth: arbEth, usd: (parseFloat(arbEth) * ethPrice).toFixed(2) },
  });
}
