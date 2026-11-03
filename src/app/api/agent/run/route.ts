import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repo";
import { DEFAULT_MODEL, runLlmBatch } from "@/agent/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDER_DATE = "2026-11-02";

export async function POST(request: Request) {
  const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENROUTER_API_KEY;
  const repo = getRepository();

  if (!apiKey) {
    return NextResponse.json(
      { error: "No model key is configured (OPENCODE_GO_API_KEY or OPENROUTER_API_KEY)" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(Math.max(Number(body.limit ?? 5), 1), 10);

  const emails = await repo.listUnprocessed(limit);
  if (emails.length === 0) {
    return NextResponse.json({ ...(await repo.getAgentStatus()), batch: 0, failures: [] });
  }

  const snapshot = await repo.getSnapshot();
  const out = await runLlmBatch(emails, snapshot, ORDER_DATE, new Map(), {
    apiKey,
    concurrency: 8,
  });
  await repo.saveAgentResults(out.results, out.usage, DEFAULT_MODEL);

  const status = await repo.getAgentStatus();
  return NextResponse.json({
    ...status,
    batch: out.results.length,
    batchUsage: out.usage,
    failures: out.failures,
  });
}
