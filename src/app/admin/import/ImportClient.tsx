"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importAction, type ImportState } from "./actions";

const initial: ImportState = { ok: false, error: null };

function Btn({ intent, children, primary }: { intent: string; children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      disabled={pending}
      className={
        primary
          ? "rounded-lg bg-matera-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      }
    >
      {pending ? "Traitement…" : children}
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs text-matera-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-matera-ink">{value}</div>
    </div>
  );
}

export default function ImportClient() {
  const [state, formAction] = useFormState(importAction, initial);
  const r = state.report;

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-matera-ink">
          Fichier BSPCE 2026 (.xlsx) <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-matera-muted">
          Onglets attendus : « Par titulaires » (grants) et « Sheet1 » (départs).
        </p>
        <input
          type="file"
          name="bspce"
          accept=".xlsx,.xls"
          required
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        <div className="mt-3 flex gap-3">
          <Btn intent="preview" primary>
            Générer l&apos;aperçu
          </Btn>
          {r && <Btn intent="confirm">Confirmer et écrire en base</Btn>}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.done && state.result && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Import réussi : {state.result.holdersUpserted} détenteurs, {state.result.batchesInserted} lots,
          {" "}{state.result.departuresUpserted} départs suivis.
        </p>
      )}

      {r && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-matera-ink">Rapport de pré-import</h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Détenteurs" value={r.holders} />
            <Stat label="Nouveaux" value={state.diff?.newHolders ?? 0} />
            <Stat label="Mis à jour" value={state.diff?.updatedHolders ?? 0} />
            <Stat label="Sans email" value={r.holdersNoEmail} highlight={r.holdersNoEmail > 0} />
            <Stat label="Employés actuels" value={r.current} />
            <Stat label="Ex-employés" value={r.ex} />
            <Stat label="Statut inconnu" value={r.unknownStatus} highlight={r.unknownStatus > 0} />
            <Stat label="Fondateurs" value={r.founders.length} highlight={r.founders.length > 0} />
            <Stat label="Lots actifs" value={r.batchesActive} />
            <Stat label="Lots caducs (voided)" value={r.batchesVoided} />
            <Stat label="Solde exerçable total" value={r.totalExercisableBalance.toLocaleString("fr-FR")} />
            <Stat label="Départs suivis" value={r.departures} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {r.founders.length > 0 && (
              <ReviewList title="Fondateurs (process dédié)" items={r.founders} tone="blue" />
            )}
            {r.noEmailPeople.length > 0 && (
              <ReviewList
                title="Sans email personnel — non contactables"
                items={r.noEmailPeople}
                tone="amber"
              />
            )}
            {r.unknownStatusPeople.length > 0 && (
              <ReviewList
                title="Statut à reclasser"
                items={r.unknownStatusPeople}
                tone="amber"
              />
            )}
            {r.departuresUnmatched.length > 0 && (
              <ReviewList
                title="Départs sans détenteur correspondant"
                items={r.departuresUnmatched}
                tone="red"
              />
            )}
          </div>

          <div className="rounded-lg bg-white p-3 text-xs text-matera-muted">
            <span className="font-medium text-matera-ink">Départs :</span> {r.departures} suivis,
            dont <span className="font-medium text-red-600">{r.departuresNoExtension}</span> en
            non-prolongation (fenêtre d&apos;exercice courte).
          </div>

          {state.warnings && state.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {state.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function ReviewList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "blue" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-blue-200 bg-blue-50";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
        {items.slice(0, 30).map((it, i) => (
          <li key={i}>{it}</li>
        ))}
        {items.length > 30 && <li className="text-xs text-matera-muted">… +{items.length - 30}</li>}
      </ul>
    </div>
  );
}
