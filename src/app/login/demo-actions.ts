"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEMO_MODE,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_COOKIE,
  DEMO_ROLE_COOKIE,
  DEMO_STATE_COOKIES,
} from "@/lib/demo";

export interface DemoLoginState {
  error: string | null;
}

// Demo login: a single admin login. Holder surveys are reached by
// impersonation from the admin Holders page.
export async function demoLogin(
  _prev: DemoLoginState,
  formData: FormData,
): Promise<DemoLoginState> {
  if (!DEMO_MODE) return { error: "Mode démo désactivé." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return { error: "Identifiants incorrects." };
  }

  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 };
  const c = cookies();
  c.set(DEMO_COOKIE, "1", opts);
  c.set(DEMO_ROLE_COOKIE, "admin", opts);
  redirect("/admin");
}

// Full reset — clears everything (session, impersonation, responses, settings).
export async function demoLogout(): Promise<void> {
  const c = cookies();
  for (const name of DEMO_STATE_COOKIES) c.delete(name);
  redirect("/login");
}
