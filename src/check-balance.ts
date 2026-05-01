import { createPublicClient, http, formatUnits, formatEther, type Address } from "viem";
import { base, arbitrum } from "viem/chains";
import { PRIVATE_KEY, CHAINS, TOKENS } from "./config.js";
import { privateKeyToAccount } from "viem/accounts";

if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set in .env");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddress = account.address;

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function getBalances(
  chain: typeof base | typeof arbitrum,
  rpcUrl: string,
  tokens: { usdc: Address; weth: Address }
) {
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const [ethBalance, usdcBalance, wethBalance] = await Promise.all([
    client.getBalance({ address: walletAddress }),
    client.readContract({
      address: tokens.usdc,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
    client.readContract({
      address: tokens.weth,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    }),
  ]);

  return { ethBalance, usdcBalance, wethBalance };
}

async function main() {
  console.log(`Wallet: ${walletAddress}\n`);

  const baseBalances = await getBalances(
    base,
    CHAINS.base.rpcUrl,
    TOKENS.base
  );
  console.log(`--- ${CHAINS.base.name} (origin) ---`);
  console.log(`  ETH:  ${formatEther(baseBalances.ethBalance)}`);
  console.log(`  WETH: ${formatEther(baseBalances.wethBalance)}`);
  console.log(`  USDC: ${formatUnits(baseBalances.usdcBalance, 6)}`);

  const arbBalances = await getBalances(
    arbitrum,
    CHAINS.arbitrum.rpcUrl,
    TOKENS.arbitrum
  );
  console.log(`\n--- ${CHAINS.arbitrum.name} (destination) ---`);
  console.log(`  ETH:  ${formatEther(arbBalances.ethBalance)}`);
  console.log(`  WETH: ${formatEther(arbBalances.wethBalance)}`);
  console.log(`  USDC: ${formatUnits(arbBalances.usdcBalance, 6)}`);
}

main().catch(console.error);
