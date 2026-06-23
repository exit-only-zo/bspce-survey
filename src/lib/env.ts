// Centralised env access with clear errors when something is missing.
// Public vars are inlined by Next at build time (NEXT_PUBLIC_*).

// Trim and strip a single pair of surrounding quotes — guards against env
// values accidentally stored as `"value"` or with stray whitespace (a common
// mistake when pasting into hosting dashboards).
export function cleanEnv(value: string | undefined): string | undefined {
  if (value == null) return value;
  let s = value.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function required(name: string, value: string | undefined): string {
  const v = cleanEnv(value);
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
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
