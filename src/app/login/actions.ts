"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admins";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { clientIp, logAccess } from "@/lib/logging";
import { env } from "@/lib/env";
import { ADMIN_COOKIE, signAdminSession } from "@/lib/auth/admin-session";

export interface LoginState {
  error: string | null;
}

// Admin login by email + shared password (no email magic-link). Holders never
// log in — they use their unique /s/<token> link. On success we set a signed
// admin-session cookie.
export async function adminLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Rate limit: 5 / IP / hour (defends against password guessing).
  const ip = clientIp() ?? "unknown";
  const { ok } = await checkLoginRateLimit(ip);
  if (!ok) {
    return { error: "Trop de tentatives. Veuillez réessayer dans une heure." };
  }

  const valid = isAdminEmail(email) && password.length > 0 && password === env.adminPassword();
  if (!valid) {
    await logAccess(email || null, "/login:failed");
    return { error: "Identifiants administrateur incorrects." };
  }

  cookies().set(ADMIN_COOKIE, signAdminSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  await logAccess(email, "/login:admin");
  redirect("/admin");
}
