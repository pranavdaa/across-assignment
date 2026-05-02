import { NextResponse } from "next/server";
import { ACROSS_API_URL, CHAINS } from "@/lib/config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const txHash = searchParams.get("txHash");

  if (!txHash) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  const query = new URLSearchParams({
    depositTxnRef: txHash,
    originChainId: String(CHAINS.base.id),
  });

  const res = await fetch(`${ACROSS_API_URL}/deposit/status?${query}`);

  if (!res.ok) {
    return NextResponse.json({ status: "pending", message: "Indexing..." });
  }

  const data = await res.json();
  return NextResponse.json({
    status: data.status,
    depositId: data.depositId,
    fillTx: data.fillTxnRef || data.fillTx,
    destinationChainId: data.destinationChainId,
  });
}
