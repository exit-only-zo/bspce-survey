import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { computeDashboard } from "@/lib/dashboard";
import { fmtEurRange, fmtNum } from "@/lib/format";
import StatusPill from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ResponsesPage() {
  const settings = await getSettings();
  const d = await computeDashboard(settings);

  const maxHist = Math.max(1, ...d.histogram.map((h) => h.count));
  const exTotal = Math.max(1, d.exPie.yes + d.exPie.no + d.exPie.pending);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-matera-ink">Réponses</h1>
        <Link
          href="/admin/responses/export"
          prefetch={false}
          className="rounded-lg border border-matera-primary px-4 py-2 text-sm font-medium text-matera-primary hover:bg-blue-50"
        >
          Export CSV
        </Link>
      </div>
      <p className="mt-1 text-sm text-matera-muted">
        Tous les chiffres se recalculent à partir des prix et plafonds actuels
        (modifiables dans Paramètres).
      </p>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Taux de réponse" value={`${d.totals.rate} %`} sub={`${d.totals.respondents} / ${d.totals.holders} détenteurs`} />
        <Kpi label="Employés actuels" value={`${d.byType.current.rate} %`} sub={`${d.byType.current.respondents} / ${d.byType.current.holders}`} />
        <Kpi label="Ex-employés" value={`${d.byType.ex.rate} %`} sub={`${d.byType.ex.respondents} / ${d.byType.ex.holders}`} />
        <Kpi label="Titres indiqués à la vente" value={fmtNum(d.totalTitlesForSale)} />
        <Kpi label="Produit indicatif total" value={fmtEurRange(d.totalProceedsMin, d.totalProceedsMax)} />
        <Kpi
          label="% moyen (employés actuels)"
          value={d.avgPctCurrent === null ? "—" : `${d.avgPctCurrent.toFixed(1)} %`}
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-matera-ink">
            Distribution des % à céder (employés actuels)
          </h2>
          <div className="mt-4 space-y-2">
            {d.histogram.map((h) => (
              <div key={h.label} className="flex items-center gap-3">
                <span className="w-16 text-right text-xs text-matera-muted">{h.label}</span>
                <div className="h-5 flex-1 rounded bg-slate-100">
                  <div
                    className="h-5 rounded bg-matera-primary"
                    style={{ width: `${(h.count / maxHist) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-medium text-matera-ink">{h.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-matera-ink">Ex-employés : Oui / Non / En attente</h2>
          <div className="mt-4 flex h-5 overflow-hidden rounded bg-slate-100">
            <Seg value={d.exPie.yes} total={exTotal} className="bg-emerald-500" />
            <Seg value={d.exPie.no} total={exTotal} className="bg-red-400" />
            <Seg value={d.exPie.pending} total={exTotal} className="bg-slate-300" />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-matera-muted">
            <Legend className="bg-emerald-500" label={`Oui (${d.exPie.yes})`} />
            <Legend className="bg-red-400" label={`Non (${d.exPie.no})`} />
            <Legend className="bg-slate-300" label={`En attente (${d.exPie.pending})`} />
          </div>
          {d.timeseries.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-matera-muted">
                Réponses cumulées
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {d.timeseries.map((t) => (
                  <li key={t.date} className="flex justify-between">
                    <span>{t.date}</span>
                    <span className="font-medium">{t.cumulative}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Individual responses table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-matera-muted">
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Titres</th>
              <th className="px-3 py-2 font-medium">Réponse</th>
              <th className="px-3 py-2 text-right font-medium">Produit indicatif</th>
              <th className="px-3 py-2 font-medium">Modifié le</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.holderId} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-matera-ink">{r.name}</div>
                  <div className="text-xs text-matera-muted">{r.email}</div>
                </td>
                <td className="px-3 py-2">
                  {r.type === "current_employee" ? "Actuel" : "Ex"}
                  {r.hasOverride && <span className="ml-1 text-xs text-amber-600">⚑</span>}
                </td>
                <td className="px-3 py-2 text-right">{fmtNum(r.totalWarrants + r.ordinaryShares)}</td>
                <td className="px-3 py-2">
                  <StatusPill hasResponse={r.hasResponse} requestStatus={r.requestStatus} label={r.responseLabel} />
                </td>
                <td className="px-3 py-2 text-right">
                  {r.hasResponse ? fmtEurRange(r.proceedsMin, r.proceedsMax) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-matera-muted">
                  {r.lastModifiedAt ? r.lastModifiedAt.slice(0, 16).replace("T", " ") : "—"}
                </td>
              </tr>
            ))}
            {d.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-matera-muted">
                  Aucun détenteur. Importez les données depuis l&apos;onglet Import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-matera-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-matera-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-matera-muted">{sub}</div>}
    </div>
  );
}

function Seg({ value, total, className }: { value: number; total: number; className: string }) {
  if (value === 0) return null;
  return <div className={className} style={{ width: `${(value / total) * 100}%` }} />;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
