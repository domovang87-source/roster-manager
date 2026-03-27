import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      `Supabase env vars missing on client. URL: ${url ? "ok" : "MISSING"}, KEY: ${key ? "ok" : "MISSING"}`
    );
  }

  return createBrowserClient(url, key);
}
