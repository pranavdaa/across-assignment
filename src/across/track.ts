import { ACROSS_API_URL, CHAINS } from "../config.js";

export interface DepositStatus {
  status: "pending" | "filled" | "expired" | "refunded";
  originChainId: number;
  destinationChainId: number;
  depositId: string;
  depositTxHash: string;
  fillTx: string | null;
  fillTxnRef: string | null;
  depositRefundTxHash: string | null;
}

export async function trackDeposit(params: {
  depositTxHash: string;
  originChainId: number;
  timeoutMs?: number;
}): Promise<DepositStatus> {
  const timeout = params.timeoutMs ?? 5 * 60 * 1000;
  const startTime = Date.now();
  let attempt = 0;
  const backoffSchedule = [5000, 10000, 20000, 30000];

  while (Date.now() - startTime < timeout) {
    attempt++;
    const delay = backoffSchedule[Math.min(attempt - 1, backoffSchedule.length - 1)];

    const query = new URLSearchParams({
      depositTxnRef: params.depositTxHash,
      originChainId: String(params.originChainId),
    });

    const url = `${ACROSS_API_URL}/deposit/status?${query}`;
    const res = await fetch(url);

    if (!res.ok) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `[Track] [${elapsed}s] Attempt ${attempt}: API error ${res.status}, retrying...`
      );
      await sleep(delay);
      continue;
    }

    const data = (await res.json()) as DepositStatus;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    if (data.status === "filled") {
      console.log(`[Track] [${elapsed}s] Deposit FILLED`);
      console.log(`[Track] Fill tx: ${data.fillTxnRef ?? data.fillTx}`);
      return data;
    }

    if (data.status === "expired" || data.status === "refunded") {
      console.log(`[Track] [${elapsed}s] Deposit ${data.status.toUpperCase()}`);
      if (data.depositRefundTxHash) {
        console.log(`[Track] Refund tx: ${data.depositRefundTxHash}`);
      }
      return data;
    }

    console.log(
      `[Track] [${elapsed}s] Attempt ${attempt}: status = ${data.status}, next check in ${delay / 1000}s...`
    );
    await sleep(delay);
  }

  throw new Error(
    `Deposit not filled within ${timeout / 1000}s timeout. Last status: pending.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const txHash = process.argv[2];

  if (!txHash) {
    console.error("Usage: npm run track <depositTxHash>");
    console.error(
      "Example: npm run track 0xabc123..."
    );
    process.exit(1);
  }

  console.log(`[Track] Tracking deposit: ${txHash}`);
  console.log(`[Track] Origin chain: ${CHAINS.base.name} (${CHAINS.base.id})`);
  console.log(`[Track] Polling with backoff: 5s → 10s → 20s → 30s (max 5 min)\n`);

  const result = await trackDeposit({
    depositTxHash: txHash,
    originChainId: CHAINS.base.id,
  });

  console.log(`\n--- Tracking Result ---`);
  console.log(`  Status:      ${result.status}`);
  console.log(`  Deposit ID:  ${result.depositId}`);
  console.log(`  Origin:      ${result.originChainId}`);
  console.log(`  Destination: ${result.destinationChainId}`);
  if (result.fillTxnRef || result.fillTx) {
    console.log(`  Fill tx:     ${result.fillTxnRef ?? result.fillTx}`);
  }
}

const isMainModule = process.argv[1]?.endsWith("across/track.ts");
if (isMainModule) {
  main().catch((err) => {
    console.error("Tracking failed:", err.message);
    process.exit(1);
  });
}
