import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { logAccess } from "@/lib/logging";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NdaForm from "./NdaForm";

export const dynamic = "force-dynamic";

export default async function NdaPage() {
  const { email, isAdmin, holder } = await getSessionContext();

  if (!email) redirect("/login");
  if (isAdmin) redirect("/admin");
  if (!holder) redirect("/login");

  // Already accepted -> straight to survey.
  if (holder.nda_accepted_at) redirect("/survey");

  await logAccess(email, "/nda");

  const lang = getLang();
  const tr = t(lang);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-matera-ink">{tr.nda.title}</h1>
          <LanguageSwitcher current={lang} />
        </div>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>{tr.nda.p1}</p>
          <p>{tr.nda.p2}</p>
          <p>{tr.nda.p3}</p>
        </div>
        <NdaForm lang={lang} />
      </div>
      <p className="mt-6 text-center text-xs text-matera-muted">{tr.nda.footer}</p>
    </main>
  );
}
