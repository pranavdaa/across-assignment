import "dotenv/config";

export const ACROSS_API_URL =
  process.env.ACROSS_API_URL || "https://app.across.to/api";

export const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;

export const COINBASE_API_KEY_ID = process.env.COINBASE_API_KEY_ID;
export const COINBASE_API_KEY_SECRET = process.env.COINBASE_API_KEY_SECRET;

export const TOKENS = {
  base: {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    weth: "0x4200000000000000000000000000000000000006" as `0x${string}`,
    eth: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  },
  arbitrum: {
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`,
    eth: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  },
} as const;

export const CHAINS = {
  base: {
    id: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
  },
  arbitrum: {
    id: 42161,
    name: "Arbitrum",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
} as const;
