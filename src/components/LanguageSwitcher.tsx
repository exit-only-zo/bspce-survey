"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { setLang } from "@/app/lang-actions";
import type { Lang } from "@/lib/i18n";

// FR / DE toggle for holder pages. Persists the choice and refreshes.
export default function LanguageSwitcher({ current }: { current: Lang }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const pick = (lang: Lang) => {
    if (lang === current) return;
    startTransition(() => setLang(lang, pathname));
  };

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs" aria-label="Langue">
      {(["fr", "de"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => pick(l)}
          className={
            (l === current
              ? "bg-matera-primary text-white"
              : "bg-white text-slate-600 hover:bg-slate-100") + " px-2.5 py-1 font-medium uppercase disabled:opacity-60"
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}
