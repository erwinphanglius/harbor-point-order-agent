"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRepository } from "@/lib/repo";
import { isAuthConfigured } from "@/lib/auth";
import type { ReleaseEdit } from "@/repository/types.js";

export interface ActionResponse {
  ok: boolean;
  reasons: string[];
}

function fromResult(r: { ok: boolean; reasons: string[] }): ActionResponse {
  return { ok: r.ok, reasons: r.reasons };
}

function revalidateAll(emailId?: string): void {
  revalidatePath("/");
  revalidatePath("/audit");
  if (emailId) revalidatePath(`/emails/${emailId}`);
}

export async function releaseOrder(emailId: string, soNumber: string): Promise<ActionResponse> {
  const r = getRepository().release(emailId, soNumber);
  revalidateAll(emailId);
  return fromResult(r);
}

export async function releaseWithEditsAction(
  emailId: string,
  soNumber: string,
  edits: ReleaseEdit,
): Promise<ActionResponse> {
  const r = getRepository().releaseWithEdits(emailId, soNumber, edits);
  revalidateAll(emailId);
  return fromResult(r);
}

export async function rejectOrder(emailId: string, soNumber: string | null, reason: string): Promise<ActionResponse> {
  const r = getRepository().reject(emailId, soNumber, reason);
  revalidateAll(emailId);
  return fromResult(r);
}

export async function markNoAction(emailId: string): Promise<ActionResponse> {
  const r = getRepository().markNoAction(emailId);
  revalidateAll(emailId);
  return fromResult(r);
}

export async function bulkRelease(emailIds: string[]): Promise<ActionResponse> {
  const results = getRepository().bulkRelease(emailIds);
  const failed = results.filter((r) => !r.result.ok);
  revalidateAll();
  if (failed.length === 0) return { ok: true, reasons: [] };
  return {
    ok: false,
    reasons: failed.map((f) => `${f.emailId}: ${f.result.reasons.join("; ")}`),
  };
}

export async function approveChange(emailId: string): Promise<ActionResponse> {
  const r = getRepository().approveChange(emailId);
  revalidateAll(emailId);
  return fromResult(r);
}

export async function signOutAction(): Promise<void> {
  if (isAuthConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
