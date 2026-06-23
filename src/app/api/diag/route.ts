import { NextResponse, type NextRequest } from "next/server";
import { cleanEnv } from "@/lib/env";
import { isAdminEmail } from "@/lib/auth/admins";

// TEMPORARY diagnostic — remove after debugging the admin login + import.
// Never returns secret VALUES (only length / prefix / boolean flags).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") {
    return new NextResponse("not found", { status: 404 });
  }

  // Service-role key as seen at runtime.
  const rawKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? "";
  // URL: env.supabaseUrl() reads NEXT_PUBLIC_SUPABASE_URL, which is INLINED at
  // build time. We read both the inlined value and process.env to compare.
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";

  // Live Supabase REST ping using the RUNTIME key + url.
  let supabaseStatus: number | null = null;
  let supabaseBody = "";
  try {
    const r = await fetch(`${url}/rest/v1/holders?select=id&limit=1`, {
      headers: { apikey: rawKey, Authorization: `Bearer ${rawKey}` },
      cache: "no-store",
    });
    supabaseStatus = r.status;
    supabaseBody = (await r.text()).slice(0, 200);
  } catch (e) {
    supabaseBody = `fetch threw: ${(e as Error).message}`;
  }

  return NextResponse.json({
    urlUsed: url || null,
    serviceKeyPresent: rawKey.length > 0,
    serviceKeyLen: rawKey.length,
    serviceKeyPrefix: rawKey.slice(0, 10),
    serviceKeySuffix: rawKey.slice(-4),
    supabaseStatus,
    supabaseBody,
    nodeVersion: process.version,
  });
}
