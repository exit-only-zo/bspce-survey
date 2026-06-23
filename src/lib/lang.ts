import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";

// Resolve the holder-facing language: explicit cookie choice wins; otherwise
// fall back to the browser's Accept-Language (German browsers default to DE).
export function getLang(): Lang {
  const cookie = cookies().get(LANG_COOKIE)?.value;
  if (cookie === "de" || cookie === "fr") return cookie;
  const accept = headers().get("accept-language")?.toLowerCase() ?? "";
  return accept.startsWith("de") ? "de" : "fr";
}
