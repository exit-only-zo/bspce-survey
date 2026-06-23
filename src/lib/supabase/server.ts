import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";

// Server-side Supabase client bound to the user's session cookies.
// Uses the ANON key, so RLS applies — this client can only read what the
// authenticated holder is allowed to read. Use this in Server Components and
// route handlers for the auth session and holder-scoped reads.
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh is handled by middleware instead.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          /* see above */
        }
      },
    },
  });
}
