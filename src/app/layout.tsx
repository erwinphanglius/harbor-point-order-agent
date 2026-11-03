import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { signOutAction } from "./actions";

export const metadata: Metadata = {
  title: "Harbor Point Order Agent",
  description: "Agent-native order-to-cash intake with human review",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authConfigured = isAuthConfigured();
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        {!authConfigured && (
          <div className="bg-yellow-300 px-4 py-2 text-sm font-medium text-yellow-900">
            Auth is disabled (no Supabase env vars) — running open in dev mode.
          </div>
        )}
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-base font-semibold">
                Harbor Point Order Agent
              </Link>
              <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
                Inbox
              </Link>
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/audit" className="text-sm text-gray-600 hover:text-gray-900">
                Audit
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {user ? `${user.email}${user.isDev ? " (dev)" : ""}` : "signed out"}
              </span>
              {authConfigured && (
                <form action={signOutAction}>
                  <button type="submit" className="text-xs text-gray-600 underline hover:text-gray-900">
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
