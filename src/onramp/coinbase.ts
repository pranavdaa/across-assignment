import { SignJWT, importJWK } from "jose";
import { randomBytes } from "crypto";
import {
  COINBASE_API_KEY_ID,
  COINBASE_API_KEY_SECRET,
  PRIVATE_KEY,
  CHAINS,
} from "../config.js";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { OnrampProvider, OnrampParams, OnrampResult } from "./types.js";

const CDP_ONRAMP_TOKEN_URL =
  "https://api.developer.coinbase.com/onramp/v1/token";
const COINBASE_PAY_URL = "https://pay.coinbase.com/buy/select-asset";

async function buildJwt(
  keyId: string,
  keySecret: string,
  uri: string
): Promise<string> {
  const secretBytes = Buffer.from(keySecret, "base64");

  // CDP API keys use ES256 (P-256) or EdDSA (Ed25519).
  // 64-byte secret = Ed25519 keypair (32-byte seed + 32-byte public key)
  // 32-byte secret = Ed25519 seed only
  if (secretBytes.length === 64 || secretBytes.length === 32) {
    const seed = secretBytes.subarray(0, 32);
    const pub = secretBytes.length === 64
      ? secretBytes.subarray(32)
      : undefined;
    const jwk: Record<string, string> = {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
    };
    if (pub) {
      jwk.x = pub.toString("base64url");
    }
    const edKey = await importJWK(jwk, "EdDSA");

    const nonce = randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      sub: keyId,
      iss: "cdp",
      aud: ["cdp_service"],
      uris: [uri],
    })
      .setProtectedHeader({ alg: "EdDSA", kid: keyId, nonce, typ: "JWT" })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .sign(edKey);
  }

  throw new Error("Unsupported key format: expected 32 or 64 byte Ed25519 key");
}

async function getSessionToken(
  keyId: string,
  keySecret: string,
  walletAddress: string,
  blockchains: string[]
): Promise<string> {
  const uri = `POST api.developer.coinbase.com/onramp/v1/token`;
  const jwt = await buildJwt(keyId, keySecret, uri);

  const res = await fetch(CDP_ONRAMP_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addresses: [{ address: walletAddress, blockchains }],
      assets: ["ETH"],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coinbase token API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

export class CoinbaseOnrampProvider implements OnrampProvider {
  constructor(
    private keyId: string,
    private keySecret: string
  ) {}

  async generateOnrampUrl(params: OnrampParams): Promise<OnrampResult> {
    const sessionToken = await getSessionToken(
      this.keyId,
      this.keySecret,
      params.walletAddress,
      [params.chainName]
    );

    const url = `${COINBASE_PAY_URL}?sessionToken=${sessionToken}`;

    return { url, sessionToken };
  }
}

export async function waitForBalance(
  walletAddress: `0x${string}`,
  minBalance: bigint,
  timeoutMs: number = 5 * 60 * 1000
): Promise<bigint> {
  const client = createPublicClient({
    chain: base,
    transport: http(CHAINS.base.rpcUrl),
  });

  const startTime = Date.now();
  const initialBalance = await client.getBalance({ address: walletAddress });

  console.log(
    `[Onramp] Waiting for ETH balance to increase on Base...`
  );
  console.log(
    `[Onramp] Current balance: ${Number(initialBalance) / 1e18} ETH`
  );

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const balance = await client.getBalance({ address: walletAddress });

    if (balance > initialBalance && balance >= minBalance) {
      console.log(
        `[Onramp] Balance increased to ${Number(balance) / 1e18} ETH`
      );
      return balance;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[Onramp] [${elapsed}s] Balance: ${Number(balance) / 1e18} ETH, waiting...`);
  }

  throw new Error(`Onramp timeout: balance did not increase within ${timeoutMs / 1000}s`);
}

async function main() {
  if (!COINBASE_API_KEY_ID || !COINBASE_API_KEY_SECRET) {
    console.error("COINBASE_API_KEY_ID and COINBASE_API_KEY_SECRET must be set in .env");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Wallet: ${account.address}`);
  console.log(`Target chain: Base (${CHAINS.base.id})\n`);

  const provider = new CoinbaseOnrampProvider(
    COINBASE_API_KEY_ID,
    COINBASE_API_KEY_SECRET
  );

  console.log("[Onramp] Generating Coinbase Onramp URL...");

  const result = await provider.generateOnrampUrl({
    walletAddress: account.address,
    chainId: CHAINS.base.id,
    chainName: "base",
    asset: "ETH",
    fiatAmount: 2,
    fiatCurrency: "USD",
  });

  console.log(`\n[Onramp] Open this URL to buy ETH on Base:\n`);
  console.log(`  ${result.url}\n`);

  // Open in default browser on macOS
  const { exec } = await import("child_process");
  exec(`open "${result.url}"`);
  console.log("[Onramp] Opened in browser. Complete the purchase, then ETH will arrive on Base.\n");
}

const isMainModule = process.argv[1]?.endsWith("onramp/coinbase.ts");
if (isMainModule) {
  main().catch((err) => {
    console.error("Onramp failed:", err.message);
    process.exit(1);
  });
}
