import "server-only";
import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/auth/admins";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth/admin-session";
import {
  DEMO_MODE,
  DEMO_COOKIE,
  DEMO_ROLE_COOKIE,
  DEMO_AS_COOKIE,
  DEMO_NDA_COOKIE,
  DEMO_EMAIL,
  parseDemoNda,
} from "@/lib/demo";
import { getDemoHolderByEmail, getDemoHolderByToken } from "@/lib/demo-data";
import { HOLDER_COOKIE } from "@/lib/tokens";
import type { Holder } from "@/lib/types";

export interface SessionContext {
  email: string | null;
  isAdmin: boolean;
  holder: Holder | null;
  // True when an admin is previewing a holder's survey.
  impersonating: boolean;
}

// Resolves the current actor:
//  - Admins authenticate via Supabase (real) / a password (demo) and may
//    impersonate a holder (DEMO_AS_COOKIE) to preview their survey.
//  - Holders authenticate via their unique magic link: the access token is
//    stored in HOLDER_COOKIE and re-validated here on every request.
export async function getSessionContext(): Promise<SessionContext> {
  const c = cookies();

  if (DEMO_MODE) {
    // Admin session (password login).
    if (c.get(DEMO_COOKIE)?.value === "1" && c.get(DEMO_ROLE_COOKIE)?.value === "admin") {
      const as = c.get(DEMO_AS_COOKIE)?.value;
      if (as) {
        const holder = getDemoHolderByEmail(as);
        if (holder) {
          // Admin preview: skip the NDA gate.
          return {
            email: holder.email,
            isAdmin: false,
            holder: { ...holder, nda_accepted_at: "2026-06-22T00:00:00Z" },
            impersonating: true,
          };
        }
      }
      return { email: DEMO_EMAIL, isAdmin: true, holder: null, impersonating: false };
    }
    // Holder session via magic-link token.
    const tok = c.get(HOLDER_COOKIE)?.value;
    if (tok) {
      const h = getDemoHolderByToken(tok);
      if (h) {
        const nda = parseDemoNda(c.get(DEMO_NDA_COOKIE)?.value)[h.email] ?? null;
        return { email: h.email, isAdmin: false, holder: { ...h, nda_accepted_at: nda }, impersonating: false };
      }
    }
    return { email: null, isAdmin: false, holder: null, impersonating: false };
  }

  // --- Real mode ---
  const svc = createServiceSupabase();

  // Admin via password session cookie (+ optional impersonation).
  const adminEmail = verifyAdminSession(c.get(ADMIN_COOKIE)?.value);
  if (adminEmail && isAdminEmail(adminEmail)) {
    const as = c.get(DEMO_AS_COOKIE)?.value;
    if (as) {
      const { data } = await svc.from("holders").select("*").eq("email", as).maybeSingle();
      if (data) {
        return { email: (data as Holder).email, isAdmin: false, holder: data as Holder, impersonating: true };
      }
    }
    return { email: adminEmail, isAdmin: true, holder: null, impersonating: false };
  }

  // Holder via magic-link token.
  const tok = c.get(HOLDER_COOKIE)?.value;
  if (tok) {
    const { data } = await svc.from("holders").select("*").eq("access_token", tok).maybeSingle();
    if (data) {
      return { email: (data as Holder).email, isAdmin: false, holder: data as Holder, impersonating: false };
    }
  }

  return { email: null, isAdmin: false, holder: null, impersonating: false };
}
