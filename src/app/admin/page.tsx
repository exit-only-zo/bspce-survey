import Link from "next/link";
import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";
import { DEMO_MODE, DEMO_RESPONSES_COOKIE, parseDemoResponses } from "@/lib/demo";
import { getDemoData } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

async function counts() {
  // Demo mode: holders parsed from the BSPCE file; responses from the cookie map.
  if (DEMO_MODE) {
    const holders = getDemoData().holders.length;
    const responses = Object.keys(
      parseDemoResponses(cookies().get(DEMO_RESPONSES_COOKIE)?.value),
    ).length;
    return { holders, responses };
  }
  const svc = createServiceSupabase();
  const [holders, responses] = await Promise.all([
    svc.from("holders").select("id", { count: "exact", head: true }),
    svc.from("survey_responses").select("id", { count: "exact", head: true }),
  ]);
  return {
    holders: holders.count ?? 0,
    responses: responses.count ?? 0,
  };
}

export default async function AdminHome() {
  const c = await counts();
  const rate = c.holders ? Math.round((c.responses / c.holders) * 100) : 0;

  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">Tableau de bord</h1>
      <p className="mt-1 text-sm text-matera-muted">
        Vue d&apos;ensemble du sondage. Les tableaux détaillés arrivent dans les
        prochaines itérations.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Détenteurs enregistrés" value={c.holders} />
        <Card label="Réponses reçues" value={c.responses} />
        <Card label="Taux de réponse" value={`${rate} %`} />
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-matera-ink">Pour commencer</h2>
        <p className="mt-1 text-sm text-matera-muted">
          Importez les fichiers de données pour peupler le registre.
        </p>
        <Link
          href="/admin/import"
          className="mt-3 inline-block rounded-lg bg-matera-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Aller à l&apos;import →
        </Link>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-matera-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-matera-ink">{value}</div>
    </div>
  );
}
