// Admin identity is config-driven, NOT stored in the holders table.
// ADMIN_EMAILS is a comma-separated, case-insensitive list.

function adminSet(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminSet().has(email.trim().toLowerCase());
}
