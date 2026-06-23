// Centralised env access with clear errors when something is missing.
// Public vars are inlined by Next at build time (NEXT_PUBLIC_*).

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const env = {
  // Public
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  // Server only
  supabaseServiceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  adminPassword: () => required("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD),
  supportEmail: () => process.env.SUPPORT_EMAIL ?? "bspce-2026@matera.eu",
  upstashUrl: () => process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashToken: () => process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  adminIpAllowlist: () =>
    (process.env.ADMIN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
};
