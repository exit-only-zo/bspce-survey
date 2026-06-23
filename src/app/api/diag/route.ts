import { NextResponse, type NextRequest } from "next/server";
import { cleanEnv } from "@/lib/env";
import { isAdminEmail } from "@/lib/auth/admins";

// TEMPORARY diagnostic — remove after debugging the admin login.
// Never returns the password value (only length / flags / boolean matches).
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") {
    return new NextResponse("not found", { status: 404 });
  }
  const email = (u.searchParams.get("email") ?? "").trim().toLowerCase();
  const password = u.searchParams.get("password") ?? "";
  const rawPw = process.env.ADMIN_PASSWORD;
  return NextResponse.json({
    adminEmailsRaw: process.env.ADMIN_EMAILS ?? null,
    emailIsAdmin: isAdminEmail(email),
    adminPasswordPresent: !!rawPw,
    adminPasswordLen: (rawPw ?? "").length,
    adminPasswordStartsWithQuote: rawPw ? rawPw.startsWith('"') || rawPw.startsWith("'") : false,
    adminPasswordHasOuterSpace: rawPw ? rawPw !== rawPw.trim() : false,
    passwordMatchesRaw: rawPw != null && password === rawPw,
    passwordMatchesClean: password === cleanEnv(rawPw),
    supabaseUrlRaw: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    serviceKeyPresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    nodeVersion: process.version,
  });
}
