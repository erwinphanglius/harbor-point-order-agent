import { cookies } from "next/headers";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export interface SessionUser {
  email: string;
  id: string;
  isDev: boolean;
}

/** Dev fallback user used when Supabase env vars are absent. */
export const DEV_USER: SessionUser = { email: "dev@local", id: "dev-user", isDev: true };

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isAuthConfigured()) return DEV_USER;
  const { createClient } = await import("./supabase/server.js");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { email: user.email ?? "user", id: user.id, isDev: false };
}

/** Force every page that reads this to render dynamically (never prerendered). */
export async function touchCookies(): Promise<void> {
  // Reading the cookie store opts the request out of static generation.
  await cookies();
}
