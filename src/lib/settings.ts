import "server-only";
import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Settings, SettingKey } from "@/lib/types";
import { DEFAULT_SETTINGS, settingBool, settingNum } from "@/lib/settings-utils";
import { DEMO_MODE, DEMO_SETTINGS_COOKIE } from "@/lib/demo";

// Reads all admin_settings into a typed bag, falling back to defaults for any
// missing key. Always fetches fresh (no caching) so admin scenario-modelling
// in Settings reflects immediately across dashboards.
export async function getSettings(): Promise<Settings> {
  // Demo mode has no database — defaults merged with any cookie-stored edits.
  if (DEMO_MODE) {
    const base: Settings = { ...DEFAULT_SETTINGS, data_last_refreshed_at: "2026-06-22T00:00:00Z" };
    const raw = cookies().get(DEMO_SETTINGS_COOKIE)?.value;
    if (raw) {
      try {
        const overrides = JSON.parse(raw) as Record<string, string | null>;
        for (const [k, v] of Object.entries(overrides)) {
          if (k in base) (base as unknown as Record<string, string | null>)[k] = v;
        }
      } catch {
        /* ignore malformed cookie */
      }
    }
    return base;
  }

  const supabase = createServiceSupabase();
  const { data } = await supabase.from("admin_settings").select("key, value");
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (row.key in out) {
      (out as unknown as Record<string, string | null>)[row.key] = row.value;
    }
  }
  return out;
}

// Re-export the client-safe helpers so existing imports keep working.
export { DEFAULT_SETTINGS, settingBool, settingNum };
export type { SettingKey };
