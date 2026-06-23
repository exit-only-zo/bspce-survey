// ===========================================================================
// DEMO MODE — local, Supabase-free experience.
// ===========================================================================
// When NEXT_PUBLIC_DEMO_MODE=true, the app runs without a database:
//   - Holders/batches/departures are parsed from the real BSPCE 2026 file
//     (see demo-data.ts).
//   - The admin logs in with a password, browses the roster, and can
//     "impersonate" any holder to preview their survey.
//   - Session/role/impersonation/responses/settings live in cookies.
// Local preview ONLY — bypassed in production (flag off).
// ===========================================================================

import type { SurveyResponse, ModificationRequest } from "@/lib/types";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const DEMO_EMAIL = "enzo.barel@matera.eu";
export const DEMO_PASSWORD = "enzo";

export const DEMO_COOKIE = "demo_session";
export const DEMO_ROLE_COOKIE = "demo_role"; // "admin"
// Versioned: bumping the suffix flushes stale saved settings from browsers so
// updated defaults (e.g. the 50% cap) take effect without a manual reset.
export const DEMO_SETTINGS_COOKIE = "demo_settings_v2"; // JSON admin_settings overrides
export const DEMO_AS_COOKIE = "demo_as"; // email of the holder being impersonated
export const DEMO_RESPONSES_COOKIE = "demo_responses"; // JSON { [email]: SurveyResponse }
export const DEMO_MODREQS_COOKIE = "demo_modreqs"; // JSON { [email]: ModificationRequest }
export const DEMO_NDA_COOKIE = "demo_nda"; // JSON { [email]: ISO acceptance date }

// All demo cookies — cleared on full reset.
export const DEMO_STATE_COOKIES = [
  DEMO_COOKIE,
  DEMO_ROLE_COOKIE,
  DEMO_SETTINGS_COOKIE,
  DEMO_AS_COOKIE,
  DEMO_RESPONSES_COOKIE,
  DEMO_MODREQS_COOKIE,
  DEMO_NDA_COOKIE,
  "demo_settings", // legacy settings cookie (superseded by demo_settings_v2)
  "h_session", // holder magic-link session (see lib/tokens HOLDER_COOKIE)
];

export function parseDemoNda(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Parse the responses-map cookie ({ email: SurveyResponse }).
export function parseDemoResponses(raw: string | undefined): Record<string, SurveyResponse> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, SurveyResponse>) : {};
  } catch {
    return {};
  }
}

// Parse the modification-requests cookie ({ email: ModificationRequest }).
export function parseDemoModreqs(raw: string | undefined): Record<string, ModificationRequest> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, ModificationRequest>) : {};
  } catch {
    return {};
  }
}
