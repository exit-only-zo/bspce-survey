"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/logging";
import { DEMO_MODE, DEMO_SETTINGS_COOKIE } from "@/lib/demo";
import type { SettingKey } from "@/lib/types";

export interface SettingsState {
  ok: boolean;
  message: string | null;
  error: string | null;
}

// Boolean (checkbox) keys: absent in FormData means "false".
const TOGGLE_KEYS: SettingKey[] = [
  "survey_open",
  "ex_employees_all_or_nothing",
  "test_mode",
];

// Text/number keys: empty string is stored as null.
const VALUE_KEYS: SettingKey[] = [
  "survey_deadline",
  "webinar_info",
  "sale_price_current_employees",
  "sale_price_current_employees_max",
  "sale_price_ex_employees_vested",
  "sale_price_ex_employees_vested_max",
  "sale_price_ex_employees_unvested",
  "sale_price_ex_employees_unvested_max",
  "min_pct_current_employees",
  "max_pct_current_employees",
  "max_pct_ex_employees",
  "support_email",
  "faq_markdown",
];

function readForm(formData: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of TOGGLE_KEYS) {
    out[key] = formData.get(key) ? "true" : "false";
  }
  for (const key of VALUE_KEYS) {
    const raw = formData.get(key);
    const s = raw === null ? "" : String(raw).trim();
    out[key] = s === "" ? null : s;
  }
  return out;
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { isAdmin, email } = await getSessionContext();
  if (!isAdmin) return { ok: false, message: null, error: "Accès refusé." };

  const updates = readForm(formData);
  const before = await getSettings();

  // Demo mode: persist the whole bag in a cookie, no DB / audit.
  if (DEMO_MODE) {
    cookies().set(DEMO_SETTINGS_COOKIE, JSON.stringify(updates), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    revalidatePath("/admin");
    revalidatePath("/survey");
    return { ok: true, message: "Paramètres enregistrés (démo).", error: null };
  }

  const svc = createServiceSupabase();
  const now = new Date().toISOString();
  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value,
    updated_at: now,
    updated_by: email,
  }));

  const { error } = await svc.from("admin_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: null, error: `Échec: ${error.message}` };

  // Audit only the keys that actually changed.
  const beforeChanged: Record<string, unknown> = {};
  const afterChanged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const prevVal = (before as unknown as Record<string, string | null>)[key] ?? null;
    if (prevVal !== value) {
      beforeChanged[key] = prevVal;
      afterChanged[key] = value;
    }
  }
  if (Object.keys(afterChanged).length > 0) {
    await logAudit({
      actorEmail: email,
      action: "settings.updated",
      target: Object.keys(afterChanged).join(", "),
      before: beforeChanged,
      after: afterChanged,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/survey");
  return { ok: true, message: "Paramètres enregistrés.", error: null };
}
