"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/logging";
import {
  DEMO_MODE,
  DEMO_RESPONSES_COOKIE,
  DEMO_MODREQS_COOKIE,
  parseDemoResponses,
  parseDemoModreqs,
} from "@/lib/demo";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 };

// Resolve a modification request. `id` is the holder_id (real) or email (demo).
async function resolve(formData: FormData, approve: boolean): Promise<void> {
  const { isAdmin, email: actor } = await getSessionContext();
  if (!isAdmin) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const now = new Date().toISOString();

  if (DEMO_MODE) {
    const c = cookies();
    const modreqs = parseDemoModreqs(c.get(DEMO_MODREQS_COOKIE)?.value);
    if (modreqs[id]) {
      modreqs[id].status = approve ? "approved" : "rejected";
      modreqs[id].resolved_at = now;
      modreqs[id].resolved_by = actor;
      c.set(DEMO_MODREQS_COOKIE, JSON.stringify(modreqs), COOKIE_OPTS);
    }
    if (approve) {
      const responses = parseDemoResponses(c.get(DEMO_RESPONSES_COOKIE)?.value);
      if (responses[id]) {
        responses[id].edit_unlocked = true;
        c.set(DEMO_RESPONSES_COOKIE, JSON.stringify(responses), COOKIE_OPTS);
      }
    }
    revalidatePath("/admin/requests");
    return;
  }

  const svc = createServiceSupabase();
  await svc
    .from("modification_requests")
    .update({ status: approve ? "approved" : "rejected", resolved_at: now, resolved_by: actor })
    .eq("holder_id", id);
  if (approve) {
    await svc.from("survey_responses").update({ edit_unlocked: true }).eq("holder_id", id);
  }
  await logAudit({
    actorEmail: actor,
    action: approve ? "modification.approved" : "modification.rejected",
    target: id,
  });
  revalidatePath("/admin/requests");
}

export async function approveRequest(formData: FormData): Promise<void> {
  await resolve(formData, true);
}

export async function rejectRequest(formData: FormData): Promise<void> {
  await resolve(formData, false);
}
