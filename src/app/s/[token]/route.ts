import { NextResponse, type NextRequest } from "next/server";
import { HOLDER_COOKIE } from "@/lib/tokens";
import { DEMO_MODE } from "@/lib/demo";
import { getDemoHolderByToken } from "@/lib/demo-data";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAccess } from "@/lib/logging";

export const dynamic = "force-dynamic";

// Unique magic-link entry. The token (sent by email) authenticates the holder:
// we validate it, set the holder-session cookie, and route to NDA/survey. No
// password or email-entry step.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  const origin = req.nextUrl.origin;

  let valid = false;
  let email: string | null = null;

  if (DEMO_MODE) {
    const h = getDemoHolderByToken(token);
    valid = !!h;
    email = h?.email ?? null;
  } else {
    const svc = createServiceSupabase();
    const { data } = await svc
      .from("holders")
      .select("email")
      .eq("access_token", token)
      .maybeSingle();
    valid = !!data;
    email = data?.email ?? null;
  }

  if (!valid) {
    return NextResponse.redirect(`${origin}/login?error=lien_invalide`);
  }

  await logAccess(email, "/s:token");

  const res = NextResponse.redirect(`${origin}/survey`);
  res.cookies.set(HOLDER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 120, // 120 days — the survey window
  });
  return res;
}
