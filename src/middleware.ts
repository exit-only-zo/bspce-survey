import { NextResponse, type NextRequest } from "next/server";

// Middleware responsibilities:
//  1. Refresh the Supabase auth session cookie on every request.
//  2. Gate protected routes (/survey, /nda, /admin) behind authentication.
//  3. Enforce the optional IP allowlist for /admin.
// Fine-grained role checks (admin vs holder) and NDA gating happen in the
// route handlers/layouts, which have DB access.

// "/s" = holder magic-link entry (public; the token itself is the credential).
const PUBLIC_PATHS = ["/login", "/api/health", "/s"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function ipFromRequest(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // allowlist disabled
  if (!ip) return false;
  // Simple exact / prefix match. CIDR support can be added later if needed.
  return allowlist.some((entry) => ip === entry || ip.startsWith(entry));
}

const CONFIDENTIAL = ["/survey", "/nda", "/faq", "/admin"];
function setNoStore(res: NextResponse, pathname: string) {
  if (CONFIDENTIAL.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A holder authenticated via their magic-link token.
  const hasHolder = !!req.cookies.get("h_session")?.value;

  // Demo mode: bypass Supabase; demo (admin) cookie or holder token stands in for auth.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const hasDemo = req.cookies.get("demo_session")?.value === "1";
    if (!isPublic(pathname) && !hasDemo && !hasHolder) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    const demoRes = NextResponse.next({ request: { headers: req.headers } });
    setNoStore(demoRes, pathname);
    return demoRes;
  }

  const res = NextResponse.next({ request: { headers: req.headers } });

  // An admin authenticated via the signed password-session cookie. (Signature
  // is verified server-side in getSessionContext; here we only gate on presence.)
  const hasAdmin = !!req.cookies.get("admin_session")?.value;

  // Admin IP allowlist (defence in depth; admin role checked in the layout).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ipAllowed(ipFromRequest(req), allowlist)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (!isPublic(pathname) && !hasAdmin && !hasHolder) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // No client-side caching of confidential holder data.
  setNoStore(res, pathname);

  return res;
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
