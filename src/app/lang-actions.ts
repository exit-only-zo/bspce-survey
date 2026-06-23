"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";

// Persist the holder's language choice (1 year) and refresh the current page.
export async function setLang(lang: Lang, path: string): Promise<void> {
  cookies().set(LANG_COOKIE, lang === "de" ? "de" : "fr", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath(path || "/survey");
}
