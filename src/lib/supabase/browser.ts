"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Browser client (ANON key, RLS enforced). Used only for auth UI flows
// (e.g. sending magic links). Holder data reads happen server-side.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserSupabase() {
  if (!client) {
    client = createBrowserClient(
      env.supabaseUrl(),
      env.supabaseAnonKey(),
    );
  }
  return client;
}
