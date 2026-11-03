"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface AgentStatusProps {
  model: string;
  total: number;
  processed: number;
  remaining: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  runs: number;
}

interface Props {
  status: AgentStatusProps;
  enabled: boolean;
}

const BATCH = 5;

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function RunPanel({ status: initial, enabled }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const stop = useRef(false);

  useEffect(() => setStatus(initial), [initial]);

  const pct = status.total === 0 ? 0 : Math.round((status.processed / status.total) * 100);
  const done = status.remaining === 0 && status.processed > 0;

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    stop.current = false;
    try {
      let guard = 0;
      while (!stop.current && guard++ < 20) {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: BATCH }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Run failed (${res.status})`);
        setStatus({
          model: data.model,
          total: data.total,
          processed: data.processed,
          remaining: data.remaining,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          costUsd: data.costUsd,
          runs: data.runs,
        });
        router.refresh();
        if ((data.batch ?? 0) === 0 || data.remaining === 0) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function reset() {
    if (!window.confirm("Reset the demo? Drafts, releases and the audit trail are wiped and the 40 raw emails come back.")) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/reset", { method: "POST" });
      if (!res.ok) throw new Error(`Reset failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              running ? "animate-pulse bg-emerald-500" : done ? "bg-emerald-500" : "bg-gray-300"
            }`}
          />
          <span className="text-sm font-medium text-gray-900">
            {running ? "Agent running" : done ? "Agent finished" : status.processed > 0 ? "Agent paused" : "Agent idle"}
          </span>
          <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">{status.model}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={!enabled || running || status.remaining === 0}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {running ? `Processing… ${status.processed}/${status.total}` : status.remaining === 0 ? "All processed" : "Run agent"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!enabled || running || resetting}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            {resetting ? "Resetting…" : "Reset"}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 text-xs text-gray-500">
          <span>
            {status.processed}/{status.total} emails processed
            {status.remaining > 0 ? ` · ${status.remaining} queued` : ""}
          </span>
          <span>
            {status.tokensIn.toLocaleString()} in / {status.tokensOut.toLocaleString()} out tokens ·{" "}
            <span className="font-medium text-gray-700">{fmtCost(status.costUsd)}</span>
            {status.runs > 0 ? ` · ${status.runs} batches` : ""}
          </span>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {!enabled ? (
        <p className="mt-2 text-xs text-amber-700">OPENROUTER_API_KEY is not set on this deployment, so the agent cannot run.</p>
      ) : null}
    </section>
  );
}
