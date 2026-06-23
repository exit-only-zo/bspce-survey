"use server";

import { getSessionContext } from "@/lib/auth/session";
import { buildImportPlan, type ImportReport } from "@/lib/import/parse";
import { diffAgainstDb, applyImport, type ImportDiff, type ApplyResult } from "@/lib/import/apply";
import { DEMO_MODE } from "@/lib/demo";

export interface ImportState {
  ok: boolean;
  error: string | null;
  report?: ImportReport;
  diff?: ImportDiff;
  warnings?: string[];
  done?: boolean;
  result?: ApplyResult;
}

async function fileToBuffer(f: FormDataEntryValue | null): Promise<ArrayBuffer | null> {
  if (!f || typeof f === "string" || f.size === 0) return null;
  return await f.arrayBuffer();
}

// Single action handling both the preview (intent=preview) and the write
// (intent=confirm). Confirm re-parses the still-attached file rather than
// round-tripping a large plan through the client.
export async function importAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { isAdmin, email } = await getSessionContext();
  if (!isAdmin) return { ok: false, error: "Accès refusé." };

  const buf = await fileToBuffer(formData.get("bspce"));
  if (!buf) return { ok: false, error: "Veuillez sélectionner le fichier BSPCE 2026 (.xlsx)." };

  let plan;
  try {
    plan = buildImportPlan(buf);
  } catch (e) {
    return { ok: false, error: `Erreur de lecture: ${(e as Error).message}` };
  }

  if (plan.holders.length === 0) {
    return { ok: false, error: "Aucun détenteur exploitable. Vérifiez l'onglet « Par titulaires ».", warnings: plan.warnings };
  }

  const diff = DEMO_MODE
    ? { newHolders: plan.holders.length, updatedHolders: 0 }
    : await diffAgainstDb(plan);

  const intent = String(formData.get("intent") ?? "preview");

  if (intent === "confirm") {
    if (DEMO_MODE) {
      return {
        ok: false,
        error: "Mode démo : l'aperçu fonctionne, mais l'écriture en base est désactivée.",
        report: plan.report,
        diff,
        warnings: plan.warnings,
      };
    }
    try {
      const result = await applyImport(plan, email);
      return { ok: true, error: null, done: true, result, report: plan.report, warnings: plan.warnings };
    } catch (e) {
      return { ok: false, error: `Échec de l'import: ${(e as Error).message}`, report: plan.report, diff };
    }
  }

  return { ok: true, error: null, report: plan.report, diff, warnings: plan.warnings };
}
