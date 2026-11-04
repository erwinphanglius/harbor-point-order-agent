"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

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

const BATCH = 10;

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
  const [eta, setEta] = useState<number | null>(null);
  const stop = useRef(false);
  const resumed = useRef(false);

  useEffect(() => setStatus(initial), [initial]);

  // Refreshing mid-run kills the browser loop after the batch in flight, which
  // leaves a half-processed inbox. Opening the page on a partial run picks it
  // back up instead of waiting for a second click.
  useEffect(() => {
    if (resumed.current || !enabled || running || resetting) return;
    if (status.processed === 0 || status.remaining === 0) return;
    resumed.current = true;
    void run();
  }, [enabled, running, resetting, status.processed, status.remaining]);

  // A refresh mid-run is survivable now (the loop resumes), but the tab still
  // loses the batch in flight, so warn before it happens.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);

    // In-app links (an email, an order) do not unload the tab, but they do hide
    // the run, so ask before walking away from it.
    const guard = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || link.target === "_blank") return;
      const next = new URL(href, window.location.href);
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm("The agent is still running. Leaving this page stops it after the batch in flight. Leave anyway?")) {
        stop.current = true;
        window.location.href = next.href;
      }
    };
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [running]);

  const pct = status.total === 0 ? 0 : Math.round((status.processed / status.total) * 100);
  const done = status.remaining === 0 && status.processed > 0;

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setEta(null);
    stop.current = false;
    const startedAt = Date.now();
    const startProcessed = status.processed;
    try {
      let guard = 0;
      while (!stop.current && guard++ < 20) {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: BATCH }),
        });
        if (!res.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Your session expired. Sign in again and press Run.");
        }
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
        const done = data.processed - startProcessed;
        if (done > 0 && data.remaining > 0) {
          const perEmail = (Date.now() - startedAt) / done;
          setEta(Math.max(1, Math.round((perEmail * data.remaining) / 1000)));
        }
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
            className="flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {running && <Spinner className="h-3.5 w-3.5" />}
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

      {running ? (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Run in progress — leave this tab alone.</span> Refreshing, closing or moving to
          another page stops it after the batch in flight; come back and it carries on from where it stopped.
        </div>
      ) : null}

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
        <p className="mt-1 text-xs text-gray-400">
          {running
            ? eta
              ? `About ${eta < 60 ? `${eta} seconds` : `${Math.ceil(eta / 60)} minute${Math.ceil(eta / 60) > 1 ? "s" : ""}`} left — don't refresh or close this tab.`
              : "Working — don't refresh or close this tab."
            : `${status.total} emails, about 2 minutes in batches of ${BATCH} — keep this tab open while it runs.`}
        </p>
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {!enabled ? (
        <p className="mt-2 text-xs text-amber-700">
          No model key is set on this deployment (OPENCODE_GO_API_KEY or OPENROUTER_API_KEY), so the agent cannot run.
        </p>
      ) : null}
    </section>
  );
}
