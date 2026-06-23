"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_MODE, DEMO_COOKIE, DEMO_ROLE_COOKIE } from "@/lib/demo";
import { HOLDER_COOKIE } from "@/lib/tokens";
import { ADMIN_COOKIE } from "@/lib/auth/admin-session";

// Universal sign-out — clears the holder magic-link session and the admin
// password session (and, in demo, the demo session cookies).
export async function signOut(): Promise<void> {
  const c = cookies();
  c.delete(HOLDER_COOKIE); // holder magic-link session
  c.delete(ADMIN_COOKIE); // admin password session
  if (DEMO_MODE) {
    c.delete(DEMO_COOKIE);
    c.delete(DEMO_ROLE_COOKIE);
  }
  redirect("/login");
}
