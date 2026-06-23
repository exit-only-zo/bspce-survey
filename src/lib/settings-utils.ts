// Client-safe settings helpers + defaults.
// NO server-only imports here, so this module can be used in Client Components
// (e.g. the live-recompute slider). The server-only loader lives in settings.ts.

import type { Settings } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  sale_price_current_employees: "18",
  sale_price_current_employees_max: "20",
  sale_price_ex_employees_vested: "15.57",
  sale_price_ex_employees_vested_max: "17",
  sale_price_ex_employees_unvested: "14",
  sale_price_ex_employees_unvested_max: null,
  min_pct_current_employees: "20",
  max_pct_current_employees: "50",
  max_pct_ex_employees: "100",
  ex_employees_all_or_nothing: "true",
  survey_open: "true",
  survey_deadline: null,
  webinar_info: null,
  support_email: "bspce-2026@matera.eu",
  data_last_refreshed_at: null,
  test_mode: "false",
  faq_markdown: null,
};

export function settingBool(value: string | null | undefined): boolean {
  return value === "true" || value === "1";
}

export function settingNum(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
