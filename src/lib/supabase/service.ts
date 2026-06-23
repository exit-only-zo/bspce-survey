import "server-only";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "@/lib/env";

// Service-role client. BYPASSES RLS — full database access.
// NEVER import this into a Client Component or expose the key to the browser.
// The `server-only` import above makes the build fail if that happens.
// Use for: admin reads/writes, holder submissions (with app-level authz),
// imports, and all audit/access logging.
//
// `realtime.transport` = ws so the client can be created on Node < 22 (which
// lacks a global WebSocket). We never use realtime, but supabase-js still
// instantiates the realtime client at creation.
export function createServiceSupabase() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
