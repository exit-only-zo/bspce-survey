import "server-only";
import { randomBytes } from "node:crypto";

// Unguessable, URL-safe holder access token (~32 chars, 192 bits entropy).
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

// The cookie that carries a holder's session (the access token itself, which is
// re-validated against the DB / demo data on every request).
export const HOLDER_COOKIE = "h_session";
