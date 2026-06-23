"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { DEMO_AS_COOKIE } from "@/lib/demo";

// Admin impersonation: preview a given holder's survey. Sets a cookie read by
// getSessionContext; guarded by isAdmin. Works in demo and real mode.
export async function impersonate(formData: FormData): Promise<void> {
  const { isAdmin } = await getSessionContext();
  if (!isAdmin) redirect("/admin");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/admin/holders");

  cookies().set(DEMO_AS_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/survey");
}

// Stop impersonating — return to the admin Holders list.
export async function stopImpersonating(): Promise<void> {
  cookies().delete(DEMO_AS_COOKIE);
  redirect("/admin/holders");
}
