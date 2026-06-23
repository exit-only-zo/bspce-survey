import "server-only";
import { headers } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";

// Best-effort extraction of the client IP behind Vercel's proxy.
export function clientIp(): string | null {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export function userAgent(): string | null {
  return headers().get("user-agent");
}

// Append a row to access_log. Never throws (logging must not break a request).
export async function logAccess(userEmail: string | null, path: string): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    await supabase.from("access_log").insert({
      user_email: userEmail,
      path,
      ip_address: clientIp(),
      user_agent: userAgent(),
    });
  } catch {
    /* swallow */
  }
}

// Append a row to audit_log for an admin mutation (or data import).
export async function logAudit(args: {
  actorEmail: string | null;
  action: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    await supabase.from("audit_log").insert({
      actor_email: args.actorEmail,
      action: args.action,
      target: args.target ?? null,
      before_value: args.before ?? null,
      after_value: args.after ?? null,
      ip_address: clientIp(),
    });
  } catch {
    /* swallow */
  }
}
