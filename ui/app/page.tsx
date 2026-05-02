"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type FlowStep =
  | "idle"
  | "onramping"
  | "waiting_for_eth"
  | "bridging"
  | "tracking"
  | "complete"
  | "error";

interface Balances {
  wallet: string;
  ethPrice: number;
  base: { wei: string; eth: string; usd: string };
  arbitrum: { wei: string; eth: string; usd: string };
}

interface BridgeResult {
  depositTxHash: string;
  inputAmount: string;
  expectedOutput: string;
  fillTime: number;
  provider: string;
  gasUsed: string;
}

interface StatusResult {
  status: string;
  depositId?: string;
  fillTx?: string;
}

const BRIDGE_AMOUNT = "400000000000000";

export default function Home() {
  const [step, setStep] = useState<FlowStep>("idle");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  const [fillResult, setFillResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const fetchBalances = useCallback(async () => {
    const res = await fetch("/api/balances");
    return (await res.json()) as Balances;
  }, []);

  useEffect(() => {
    fetchBalances().then(setBalances);
    const interval = setInterval(() => fetchBalances().then(setBalances), 8000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStart) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [timerStart]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function startFlow() {
    setStep("onramping");
    setError(null);
    setLogs([]);
    setBridgeResult(null);
    setFillResult(null);
    setTimerStart(Date.now());

    try {
      const start = await fetchBalances();
      setBalances(start);
      addLog(`Base balance: ${fmt(start.base.eth)} ETH`);
      addLog(`Arbitrum balance: ${fmt(start.arbitrum.eth)} ETH`);

      addLog("Generating Coinbase Onramp session...");
      const onrampRes = await fetch("/api/onramp", { method: "POST" });
      const onrampData = await onrampRes.json();
      if (onrampData.error) throw new Error(onrampData.error);

      window.open(onrampData.url, "_blank", "width=460,height=720");
      addLog("Coinbase Onramp opened — complete the $1 ETH purchase");

      setStep("waiting_for_eth");
      addLog("Polling Base for incoming ETH...");
      const startWei = BigInt(start.base.wei);

      let arrived = false;
      for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const current = await fetchBalances();
        setBalances(current);
        if (BigInt(current.base.wei) > startWei) {
          const received = Number(BigInt(current.base.wei) - startWei) / 1e18;
          addLog(`ETH arrived on Base! +${received.toFixed(8)} ETH`);
          arrived = true;
          break;
        }
      }
      if (!arrived) throw new Error("Timeout: ETH did not arrive within 5 minutes");

      setStep("bridging");
      addLog("Requesting bridge quote from Across...");
      const bridgeRes = await fetch("/api/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: BRIDGE_AMOUNT }),
      });
      const bridge = (await bridgeRes.json()) as BridgeResult & { error?: string };
      if (bridge.error) throw new Error(bridge.error);

      setBridgeResult(bridge);
      addLog(`Quote: ${bridge.inputAmount} → ${bridge.expectedOutput} ETH`);
      addLog(`Settlement: ${bridge.provider} (Intents) — ~${bridge.fillTime}s fill`);
      addLog(`Deposit confirmed: ${bridge.depositTxHash.slice(0, 20)}...`);

      setStep("tracking");
      addLog("Waiting for relayer fill on Arbitrum...");
      let filled = false;
      for (let i = 0; i < 30; i++) {
        await sleep(3000);
        const statusRes = await fetch(`/api/status?txHash=${bridge.depositTxHash}`);
        const status = (await statusRes.json()) as StatusResult;
        if (status.status === "filled") {
          setFillResult(status);
          addLog(`Relayer filled deposit #${status.depositId}`);
          if (status.fillTx) addLog(`Fill tx: ${status.fillTx.slice(0, 20)}...`);
          filled = true;
          break;
        }
        if (status.status === "expired" || status.status === "refunded") {
          throw new Error(`Deposit ${status.status}`);
        }
      }
      if (!filled) throw new Error("Timeout waiting for relayer fill");

      const final = await fetchBalances();
      setBalances(final);
      addLog(`Final Base: ${fmt(final.base.eth)} ETH`);
      addLog(`Final Arbitrum: ${fmt(final.arbitrum.eth)} ETH`);
      addLog("Flow complete!");
      setStep("complete");
      setTimerStart(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setStep("error");
      addLog(`ERROR: ${msg}`);
      setTimerStart(null);
    }
  }

  const isRunning = !["idle", "complete", "error"].includes(step);

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(108,249,216,0.2)" }}>
            <div className="w-4 h-4 rounded-full" style={{ background: "#6CF9D8" }} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Across Bridge Demo
          </h1>
        </div>
        <p className="text-sm ml-11" style={{ color: "#6C7284" }}>
          Coinbase Onramp → Base → Across Protocol → Arbitrum
        </p>
      </header>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: "#2D2E33", border: "1px solid #3E4047" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(59,130,246,0.2)" }}>
              <span className="text-xs font-bold" style={{ color: "#60A5FA" }}>B</span>
            </div>
            <span className="text-sm font-medium text-gray-200">Base</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider" style={{ color: "#6C7284" }}>Origin</span>
          </div>
          <p className="text-2xl font-mono font-semibold text-white">
            {balances ? fmt(balances.base.eth) : "—"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs" style={{ color: "#6C7284" }}>ETH</span>
            {balances && <span className="text-xs font-mono" style={{ color: "#6CF9D8" }}>${balances.base.usd}</span>}
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#2D2E33", border: "1px solid #3E4047" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(155,125,255,0.2)" }}>
              <span className="text-xs font-bold" style={{ color: "#9B7DFF" }}>A</span>
            </div>
            <span className="text-sm font-medium text-gray-200">Arbitrum</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider" style={{ color: "#6C7284" }}>Destination</span>
          </div>
          <p className="text-2xl font-mono font-semibold text-white">
            {balances ? fmt(balances.arbitrum.eth) : "—"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs" style={{ color: "#6C7284" }}>ETH</span>
            {balances && <span className="text-xs font-mono" style={{ color: "#6CF9D8" }}>${balances.arbitrum.usd}</span>}
          </div>
        </div>
      </div>

      {/* Flow Progress */}
      <div className="rounded-xl p-4 mb-6" style={{ background: "#2D2E33", border: "1px solid #3E4047" }}>
        <div className="flex items-center justify-between">
          <FlowNode label="Onramp" icon="$" state={nodeState(step, 0)} />
          <FlowLine active={si(step) >= 1} />
          <FlowNode label="Detect" icon="◎" state={nodeState(step, 1)} />
          <FlowLine active={si(step) >= 2} />
          <FlowNode label="Bridge" icon="⇄" state={nodeState(step, 2)} />
          <FlowLine active={si(step) >= 3} />
          <FlowNode label="Fill" icon="⚡" state={nodeState(step, 3)} />
          <FlowLine active={si(step) >= 4} />
          <FlowNode label="Done" icon="✓" state={nodeState(step, 4)} />
        </div>
        {timerStart && (
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#6CF9D8" }} />
            <span className="text-xs font-mono" style={{ color: "#6C7284" }}>{elapsed}s elapsed</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={step === "complete" || step === "error" ? startFlow : isRunning ? undefined : startFlow}
        disabled={isRunning}
        style={{
          background: isRunning ? "#3E4047" : step === "error" ? "#FF6B6B" : "#6CF9D8",
          color: isRunning ? "#6C7284" : step === "error" ? "#fff" : "#1B1C21",
        }}
        className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all mb-6 cursor-pointer disabled:cursor-not-allowed ${isRunning ? "glow-pulse" : "hover:brightness-110"}`}
      >
        {step === "idle" && "Start Flow — Buy $1 ETH & Bridge to Arbitrum"}
        {step === "onramping" && "Opening Coinbase Onramp..."}
        {step === "waiting_for_eth" && "Waiting for ETH on Base..."}
        {step === "bridging" && "Bridging via Across Protocol..."}
        {step === "tracking" && "Waiting for relayer fill..."}
        {step === "complete" && "Complete — Run Again"}
        {step === "error" && "Failed — Retry"}
      </button>

      {/* Bridge Transaction Card */}
      {bridgeResult && (
        <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#2D2E33", border: "1px solid #3E4047" }}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #3E4047" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6C7284" }}>Bridge Transaction</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[120px_1fr] gap-y-2.5 text-sm">
              <span style={{ color: "#6C7284" }}>Route</span>
              <span className="text-white font-medium">Base → Arbitrum</span>
              <span style={{ color: "#6C7284" }}>Input</span>
              <span className="text-white font-mono">{bridgeResult.inputAmount} ETH</span>
              <span style={{ color: "#6C7284" }}>Output</span>
              <span className="font-mono" style={{ color: "#6CF9D8" }}>{bridgeResult.expectedOutput} ETH</span>
              <span style={{ color: "#6C7284" }}>Settlement</span>
              <span className="text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#6CF9D8" }} />
                Intents
                <span style={{ color: "#6C7284" }}>— ~{bridgeResult.fillTime}s</span>
              </span>
              <span style={{ color: "#6C7284" }}>Relayer</span>
              <span className="text-white">Across Network</span>
              <span style={{ color: "#6C7284" }}>Gas Used</span>
              <span className="text-white font-mono">{Number(bridgeResult.gasUsed).toLocaleString()}</span>
              <span style={{ color: "#6C7284" }}>Deposit Tx</span>
              <a
                href={`https://basescan.org/tx/${bridgeResult.depositTxHash}`}
                target="_blank"
                className="font-mono text-xs truncate hover:underline"
                style={{ color: "#2ECDA7" }}
              >
                {bridgeResult.depositTxHash}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Fill Confirmed Card */}
      {fillResult && (
        <div className="rounded-xl overflow-hidden mb-4" style={{ background: "rgba(108,249,216,0.05)", border: "1px solid rgba(108,249,216,0.3)" }}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(108,249,216,0.2)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6CF9D8" }}>Fill Confirmed</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-[120px_1fr] gap-y-2.5 text-sm">
              <span style={{ color: "#6C7284" }}>Deposit ID</span>
              <span className="text-white font-mono">{fillResult.depositId}</span>
              <span style={{ color: "#6C7284" }}>Mechanism</span>
              <span className="text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#6CF9D8" }} />
                Intents — relayer fronted capital
              </span>
              {fillResult.fillTx && (
                <>
                  <span style={{ color: "#6C7284" }}>Fill Tx</span>
                  <a
                    href={`https://arbiscan.io/tx/${fillResult.fillTx}`}
                    target="_blank"
                    className="font-mono text-xs truncate hover:underline"
                    style={{ color: "#2ECDA7" }}
                  >
                    {fillResult.fillTx}
                  </a>
                </>
              )}
              {timerStart === null && elapsed > 0 && (
                <>
                  <span style={{ color: "#6C7284" }}>Total Time</span>
                  <span className="font-semibold" style={{ color: "#6CF9D8" }}>{elapsed}s end-to-end</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)" }}>
          <p className="text-sm" style={{ color: "#FF6B6B" }}>{error}</p>
        </div>
      )}

      {/* Activity Log */}
      {logs.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#2D2E33", border: "1px solid #3E4047" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #3E4047" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6C7284" }}>Activity Log</h3>
            <span className="text-[10px] font-mono" style={{ color: "#6C7284" }}>{logs.length} events</span>
          </div>
          <div className="p-3 font-mono text-xs max-h-52 overflow-y-auto space-y-0.5">
            {logs.map((log, i) => (
              <p key={i} className="log-entry leading-relaxed" style={{ color: "rgba(224,224,224,0.8)" }}>
                <span style={{ color: "#6C7284" }}>{log.slice(0, 12)}</span>
                {log.slice(12)}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-10 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid #3E4047" }}>
        <span className="text-[11px]" style={{ color: "#6C7284" }}>Across Protocol — Case Study Demo</span>
        <span className="text-[11px]" style={{ color: "#6C7284" }}>Mainnet · Real ETH · ~$1</span>
      </footer>
    </main>
  );
}

function FlowNode({ label, icon, state }: { label: string; icon: string; state: "pending" | "active" | "done" }) {
  const styles = {
    pending: { bg: "#2D2E33", border: "1px solid #3E4047", color: "#6C7284" },
    active: { bg: "rgba(108,249,216,0.1)", border: "1px solid #6CF9D8", color: "#6CF9D8" },
    done: { bg: "rgba(108,249,216,0.15)", border: "1px solid #6CF9D8", color: "#6CF9D8" },
  };
  const s = styles[state];

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${state === "active" ? "glow-pulse" : ""}`}
        style={{ background: s.bg, border: s.border, color: s.color }}
      >
        {state === "done" ? "✓" : icon}
      </div>
      <span className="text-[10px] font-medium" style={{ color: s.color }}>{label}</span>
    </div>
  );
}

function FlowLine({ active }: { active: boolean }) {
  return (
    <div
      className="flex-1 h-px mx-1"
      style={{ background: active ? "rgba(108,249,216,0.5)" : "#3E4047" }}
    />
  );
}

function nodeState(step: FlowStep, index: number): "pending" | "active" | "done" {
  const current = si(step);
  if (current > index) return "done";
  if (current === index) return "active";
  return "pending";
}

function si(step: FlowStep): number {
  return ["onramping", "waiting_for_eth", "bridging", "tracking", "complete"].indexOf(step);
}

function fmt(eth: string): string {
  return parseFloat(eth).toFixed(6);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
