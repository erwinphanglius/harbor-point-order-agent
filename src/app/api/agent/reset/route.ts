import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const repo = getRepository();
  await repo.resetDemo();
  return NextResponse.json({ ...(await repo.getAgentStatus()), reset: true });
}
