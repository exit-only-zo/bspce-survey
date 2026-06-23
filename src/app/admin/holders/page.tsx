import { getSettings } from "@/lib/settings";
import { computeDashboard, type DashboardRow } from "@/lib/dashboard";
import { fmtNum } from "@/lib/format";
import { env } from "@/lib/env";
import { impersonate } from "./actions";
import CopyLink from "./CopyLink";
import StatusPill from "@/components/StatusPill";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Filters via query string: ?q=…&type=current|ex&status=responded|pending|review
export default async function HoldersPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; status?: string };
}) {
  const settings = await getSettings();
  const d = await computeDashboard(settings);
  const appUrl = env.appUrl();

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const typeF = searchParams.type ?? "";
  const statusF = searchParams.status ?? "";

  let rows = d.rows;
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  if (typeF === "current") rows = rows.filter((r) => r.type === "current_employee");
  if (typeF === "ex") rows = rows.filter((r) => r.type === "ex_employee");
  if (statusF === "responded") rows = rows.filter((r) => r.hasResponse);
  if (statusF === "pending") rows = rows.filter((r) => !r.hasResponse);
  if (statusF === "review") rows = rows.filter((r) => r.needsReview);

  rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">Détenteurs enregistrés</h1>
      <p className="mt-1 text-sm text-matera-muted">
        {fmtNum(d.rows.length)} détenteurs. Cliquez « Ouvrir le sondage » pour
        prévisualiser la vue d&apos;un détenteur (mode aperçu admin).
      </p>

      {/* Filters (GET form) */}
      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="block text-xs text-matera-muted">Recherche</label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Nom ou email"
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-matera-muted">Type</label>
          <select name="type" defaultValue={typeF} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Tous</option>
            <option value="current">Employés actuels</option>
            <option value="ex">Ex-employés</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-matera-muted">Statut réponse</label>
          <select name="status" defaultValue={statusF} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Tous</option>
            <option value="responded">A répondu</option>
            <option value="pending">En attente</option>
            <option value="review">À revoir</option>
          </select>
        </div>
        <button className="rounded-lg bg-matera-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Filtrer
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-matera-muted">
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Titres cessibles</th>
              <th className="px-3 py-2 font-medium">Réponse</th>
              <th className="px-3 py-2 text-right font-medium">Lien personnel</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 600).map((r) => (
              <Row key={r.holderId} r={r} appUrl={appUrl} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-matera-muted">
                  Aucun détenteur. Importez le fichier depuis l&apos;onglet Import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 600 && (
        <p className="mt-2 text-xs text-matera-muted">Affichage limité à 600 lignes — affinez la recherche.</p>
      )}
    </div>
  );
}

function Row({ r, appUrl }: { r: DashboardRow; appUrl: string }) {
  const link = r.accessToken ? `${appUrl}/s/${r.accessToken}` : null;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 font-medium text-matera-ink">
          {r.name}
          {r.isFounder && <Badge tone="blue">fondateur</Badge>}
          {r.needsReview && <Badge tone="amber">à revoir</Badge>}
        </div>
        <div className="text-xs text-matera-muted">
          {r.hasLoginEmail ? r.email : "— sans email —"}
        </div>
      </td>
      <td className="px-3 py-2">{r.type === "current_employee" ? "Actuel" : "Ex"}</td>
      <td className="px-3 py-2 text-right">{fmtNum(r.totalWarrants + r.ordinaryShares)}</td>
      <td className="px-3 py-2">
        <StatusPill hasResponse={r.hasResponse} requestStatus={r.requestStatus} label={r.responseLabel} />
      </td>
      <td className="px-3 py-2 text-right">
        {link && r.hasLoginEmail ? <CopyLink url={link} /> : <span className="text-xs text-matera-muted">—</span>}
      </td>
      <td className="px-3 py-2 text-right">
        <form action={impersonate}>
          <input type="hidden" name="email" value={r.email} />
          <button
            disabled={!r.hasLoginEmail}
            className="rounded-md border border-matera-primary px-3 py-1 text-xs font-medium text-matera-primary hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
            title={r.hasLoginEmail ? "" : "Détenteur sans email — non connectable"}
          >
            Ouvrir le sondage →
          </button>
        </form>
      </td>
    </tr>
  );
}

function Badge({ tone, children }: { tone: "blue" | "amber"; children: React.ReactNode }) {
  const c = tone === "blue" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${c}`}>{children}</span>;
}
