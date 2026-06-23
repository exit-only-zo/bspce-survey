import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

// Login rate limit: 5 requests per IP per hour (spec). If Upstash is not
// configured (local dev), rate limiting is disabled with a console warning.
let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const url = env.upstashUrl();
  const token = env.upstashToken();
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[ratelimit] Upstash not configured — /login is NOT rate limited.");
    }
    limiter = null;
    return limiter;
  }
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    prefix: "rl:login",
  });
  return limiter;
}

export async function checkLoginRateLimit(ip: string): Promise<{ ok: boolean }> {
  const l = getLimiter();
  if (!l) return { ok: true };
  const { success } = await l.limit(ip);
  return { ok: success };
}
