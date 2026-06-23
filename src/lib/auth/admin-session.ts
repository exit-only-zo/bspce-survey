import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Password-based admin session (no email auth). On a correct login we set a
// stateless, HMAC-signed cookie carrying the admin's email + expiry. It can't be
// forged without the server secret (the Supabase service-role key).
export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8h

function secret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_PASSWORD ||
    "insecure-dev-secret"
  );
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signAdminSession(email: string): string {
  const payload = `${email.toLowerCase()}|${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${hmac(payload)}`;
}

// Returns the admin email if the cookie is valid and unexpired, else null.
export function verifyAdminSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString();
  } catch {
    return null;
  }
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [email, expStr] = payload.split("|");
  if (!email || !expStr || Date.now() > Number(expStr)) return null;
  return email.toLowerCase();
}
