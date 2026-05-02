import { NextResponse } from "next/server";
import { SignJWT, importJWK } from "jose";
import { randomBytes } from "crypto";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, COINBASE_API_KEY_ID, COINBASE_API_KEY_SECRET, CHAINS } from "@/lib/config";

export async function POST() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  const secretBytes = Buffer.from(COINBASE_API_KEY_SECRET, "base64");
  const seed = secretBytes.subarray(0, 32);
  const pub = secretBytes.subarray(32);

  const edKey = await importJWK(
    { kty: "OKP", crv: "Ed25519", d: seed.toString("base64url"), x: pub.toString("base64url") },
    "EdDSA"
  );

  const nonce = randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    sub: COINBASE_API_KEY_ID,
    iss: "cdp",
    aud: ["cdp_service"],
    uris: ["POST api.developer.coinbase.com/onramp/v1/token"],
  })
    .setProtectedHeader({ alg: "EdDSA", kid: COINBASE_API_KEY_ID, nonce, typ: "JWT" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(edKey);

  const res = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses: [{ address: account.address, blockchains: ["base"] }],
      assets: ["ETH"],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: body }, { status: res.status });
  }

  const data = (await res.json()) as { token: string };
  const url = `https://pay.coinbase.com/buy/select-asset?sessionToken=${data.token}`;

  return NextResponse.json({ url, wallet: account.address });
}
