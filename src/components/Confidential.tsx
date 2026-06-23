"use client";

import { useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";

// Flags <body data-confidential="true"> so the print stylesheet hides content
// when a holder tries to print. Cleared on unmount (e.g. navigating to admin).
export function ConfidentialBody() {
  useEffect(() => {
    document.body.setAttribute("data-confidential", "true");
    return () => document.body.removeAttribute("data-confidential");
  }, []);
  return null;
}

// Confidentiality chrome shared by all holder-facing pages:
//  - a faint diagonal watermark carrying the holder's email + timestamp
//    (CSS-only, dissuasive against screenshots)
//  - a fixed footer notice
// Set `data-confidential="true"` on <body> via the holder layout so the print
// stylesheet (globals.css) hides content when printing.

export function Watermark({ email, stamp }: { email: string; stamp: string }) {
  const text = `${email} · ${stamp}`;
  // Build a repeating diagonal field of the text.
  const rows = Array.from({ length: 14 });
  return (
    <div className="confidential-watermark" aria-hidden="true">
      <div className="absolute inset-0 -rotate-[30deg] scale-150">
        {rows.map((_, r) => (
          <div
            key={r}
            className="whitespace-nowrap text-[11px] font-medium text-slate-900/[0.05]"
            style={{ marginTop: r === 0 ? 0 : 28, letterSpacing: "0.15em" }}
          >
            {Array.from({ length: 8 }).map((__, c) => (
              <span key={c} className="mr-12">
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConfidentialFooter({ lang = "fr" }: { lang?: Lang }) {
  return (
    <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-matera-muted">
      {t(lang).footer}
    </footer>
  );
}
