// Admin identity is config-driven, NOT stored in the holders table.
// ADMIN_EMAILS is a comma-separated, case-insensitive list.

import { cleanEnv } from "@/lib/env";

// Strip surrounding quotes/whitespace per email so `"a@x.eu, b@x.eu"` or quoted
// values pasted into a dashboard still match.
function unquote(s: string): string {
  return cleanEnv(s) ?? "";
}

function adminSet(): Set<string> {
  return new Set(
    unquote(process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => unquote(e).toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminSet().has(email.trim().toLowerCase());
}
