"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAccess } from "@/lib/logging";
import { DEMO_MODE, DEMO_NDA_COOKIE, parseDemoNda } from "@/lib/demo";

// Persist NDA acceptance on the holder row, then proceed to the survey.
export async function acceptNda(): Promise<void> {
  const { holder } = await getSessionContext();
  if (!holder) {
    redirect("/login");
  }

  if (DEMO_MODE) {
    const c = cookies();
    const map = parseDemoNda(c.get(DEMO_NDA_COOKIE)?.value);
    map[holder.email] = new Date().toISOString();
    c.set(DEMO_NDA_COOKIE, JSON.stringify(map), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 120,
    });
    redirect("/survey");
  }

  if (!holder.nda_accepted_at) {
    const svc = createServiceSupabase();
    await svc
      .from("holders")
      .update({ nda_accepted_at: new Date().toISOString() })
      .eq("id", holder.id);
    await logAccess(holder.email, "/nda:accepted");
  }

  redirect("/survey");
}
