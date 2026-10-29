import { isAuthConfigured } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!isAuthConfigured()) {
    return (
      <div className="mx-auto max-w-md rounded border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Auth is disabled</h1>
        <p className="mt-2 text-sm text-gray-500">
          Supabase env vars are not set, so the app is running open in dev mode. Configure
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable login.
        </p>
      </div>
    );
  }

  return <LoginForm />;
}
