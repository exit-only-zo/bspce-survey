"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { acceptNda } from "./actions";
import { t, type Lang } from "@/lib/i18n";

function AcceptButton({ enabled, lang }: { enabled: boolean; lang: Lang }) {
  const { pending } = useFormStatus();
  const tr = t(lang);
  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className="mt-5 w-full rounded-lg bg-matera-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? tr.nda.validating : tr.nda.accept}
    </button>
  );
}

export default function NdaForm({ lang }: { lang: Lang }) {
  const [checked, setChecked] = useState(false);
  const tr = t(lang);

  return (
    <form action={acceptNda} className="mt-6">
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-matera-primary focus:ring-matera-primary"
        />
        <span>{tr.nda.checkbox}</span>
      </label>
      <AcceptButton enabled={checked} lang={lang} />
    </form>
  );
}
