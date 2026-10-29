import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getSharedDb } from "../../../db/index.js";

// Vercel cron entry point: a daily query keeps a free-tier Supabase project
// from pausing after a week of inactivity. It reuses the process-wide pool the
// repository uses instead of opening a second one.
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSharedDb();
  if (!db) {
    return NextResponse.json({ ok: true, skipped: "no-database" });
  }

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
