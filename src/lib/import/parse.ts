// ===========================================================================
// BSPCE 2026 import parser (pure, no DB writes).
// ===========================================================================
// Source: Ryo's "BSPCE 2026" workbook.
//   - Sheet "Par titulaires": one row per grant. Employee status is MANUAL
//     (column "Actif ou ex-employés") — we trust it, never re-derive from the
//     email domain (founders use short @matera.eu addresses).
//   - Sheet "Sheet1": legal departure tracking for ex-employees in process.
//   - (An old "Sheet2" mentioned in the brief is absent here and ignored.)
//
// Key modelling decisions (documented for finance review):
//   * SELLABLE quantity per grant is split into two sub-batches:
//       - vested      -> quantity = "Solde exerçable"  (is_vested = true)
//       - non-vested  -> quantity = "Quantité non vestée" (is_vested = false)
//     so the per-batch pricing engine prices each portion at the right rate.
//   * A grant with nothing sellable ("Actual in circulation" = 0 AND
//     "Quantité non vestée" = 0) is recorded as a single VOIDED batch (kept for
//     traceability, excluded from the holder UI).
//   * ordinary_shares per holder = sum of "Quantité exercée" (already-exercised
//     BSPCE are held as ordinary shares).
//   * Holders with no personal email are imported but flagged needs_review and
//     given a non-routable synthetic email (they can't be contacted/login).
// ===========================================================================

import * as XLSX from "xlsx";

const FOUNDER_SHORT_EMAILS = new Set(["raphael@matera.eu", "jeremy@matera.eu", "victor@matera.eu"]);

export interface ParsedBatch {
  batch_name: string | null;
  strike_price: number;
  quantity: number;
  is_vested: boolean;
  status: "active" | "voided";
  attribution_date: string | null;
  expiration_date: string | null;
  delegation: string | null;
  meta: Record<string, number | null>;
}

export interface PlannedHolder {
  email: string; // routable email, or synthetic "no-email-…@matera.invalid"
  hasLoginEmail: boolean;
  first_name: string | null;
  last_name: string | null;
  holder_type: "current_employee" | "ex_employee";
  employee_status: string | null;
  is_founder: boolean;
  matricule: string | null;
  matera_email: string | null;
  contract_start_date: string | null;
  ordinary_shares: number;
  needs_review: boolean;
  reasons: string[];
  batches: ParsedBatch[];
}

export interface PlannedDeparture {
  email: string;
  uplaw_id: string | null;
  gender: string | null;
  postal_address: string | null;
  departure_date: string | null;
  departure_cause: string | null;
  theoretical_deadline: string | null;
  exercise_deadline: string | null;
  bspce_granted: number | null;
  bspce_vested_at_notif: number | null;
  price_label: string | null;
  no_extension: boolean;
  admin_status: Record<string, unknown>;
}

export interface ImportReport {
  holders: number;
  holdersWithEmail: number;
  holdersNoEmail: number;
  current: number;
  ex: number;
  unknownStatus: number;
  founders: string[];
  noEmailPeople: string[];
  unknownStatusPeople: string[];
  batchesActive: number;
  batchesVoided: number;
  totalExercisableBalance: number;
  departures: number;
  departuresNoExtension: number;
  departuresUnmatched: string[];
}

export interface ImportPlan {
  holders: PlannedHolder[];
  departures: PlannedDeparture[];
  report: ImportReport;
  warnings: string[];
}

// --- helpers ---------------------------------------------------------------
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v)
    .replace(/[  \s]/g, "") // narrow/no-break/normal spaces
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

// Coerce a date-ish cell (JS Date via cellDates, "DD/MM/YYYY", or Excel serial)
// to an ISO "YYYY-MM-DD" string, or null.
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date -> JS date (epoch 1899-12-30).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const fr = parseFrenchDate(s);
  if (fr) return fr;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const FR_MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

// "30 septembre 2025" -> "2025-09-30"
function parseFrenchDate(s: string): string | null {
  const m = norm(s).match(/^(\d{1,2})([a-z]+)(\d{4})$/);
  if (!m) return null;
  const day = m[1]!;
  const month = FR_MONTHS[m[2]!];
  const year = m[3]!;
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function sheetRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
}

// Build a normalized-header -> column index map.
function headerIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const key = norm(h);
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

// --- main ------------------------------------------------------------------
export function buildImportPlan(buf: ArrayBuffer): ImportPlan {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const titSheet =
    wb.Sheets["Par titulaires"] ?? wb.Sheets[wb.SheetNames.find((n) => norm(n).includes("titulaire")) ?? ""];
  if (!titSheet) {
    return {
      holders: [],
      departures: [],
      report: emptyReport(),
      warnings: ["Onglet « Par titulaires » introuvable dans le fichier."],
    };
  }

  const rows = sheetRows(titSheet);
  const H = headerIndex(rows[0] ?? []);
  const get = (row: unknown[], key: string): unknown => {
    const i = H.get(key);
    return i === undefined ? null : row[i];
  };

  // Group grant rows by holder (personal email, or synthetic fallback).
  const groups = new Map<string, unknown[][]>();
  let junk = 0;
  for (const row of rows.slice(1)) {
    const email = str(get(row, "email"))?.toLowerCase() ?? null;
    const first = str(get(row, "prenoms"));
    const last = str(get(row, "nom"));
    const title = str(get(row, "titre"));
    // Drop fully-empty / junk rows (no identity and no grant).
    if (!email && !first && !last && !title) {
      junk++;
      continue;
    }
    const key = email ?? `__noemail__:${norm(first)}_${norm(last)}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  if (junk > 0) warnings.push(`${junk} ligne(s) vide(s)/incomplète(s) ignorée(s).`);

  const holders: PlannedHolder[] = [];
  const founders: string[] = [];
  const noEmailPeople: string[] = [];
  const unknownStatusPeople: string[] = [];
  let batchesActive = 0;
  let batchesVoided = 0;
  let totalExercisable = 0;

  for (const [key, grantRows] of groups) {
    const first = grantRows.map((r) => str(get(r, "prenoms"))).find(Boolean) ?? null;
    const last = grantRows.map((r) => str(get(r, "nom"))).find(Boolean) ?? null;
    const realEmail = key.startsWith("__noemail__:") ? null : key;
    const materaEmail = grantRows.map((r) => str(get(r, "idemploye"))).find(Boolean)?.toLowerCase() ?? null;
    const matricule = grantRows.map((r) => str(get(r, "numerodematricule"))).find(Boolean) ?? null;
    const contractStart = grantRows.map((r) => toIsoDate(get(r, "datededebutdecontrat"))).find(Boolean) ?? null;
    const statusRaw = grantRows.map((r) => str(get(r, "actifouexemployes"))).find(Boolean) ?? null;

    const checkTags = grantRows.map((r) => norm(get(r, "check"))).join(" ");
    const isFounder =
      checkTags.includes("founder") ||
      (materaEmail !== null && FOUNDER_SHORT_EMAILS.has(materaEmail)) ||
      (realEmail !== null && FOUNDER_SHORT_EMAILS.has(realEmail));

    const reasons: string[] = [];
    let needsReview = false;

    // Classification — trust the manual status; founders are current employees.
    let holderType: "current_employee" | "ex_employee";
    if (isFounder) {
      holderType = "current_employee";
    } else if (statusRaw === "Actif") {
      holderType = "current_employee";
    } else if (statusRaw === "Ex-employé") {
      holderType = "ex_employee";
    } else {
      holderType = "ex_employee"; // safe default
      needsReview = true;
      reasons.push(`Statut employé manquant/inconnu (« ${statusRaw ?? "vide"} ») — à reclasser.`);
      unknownStatusPeople.push(`${first ?? ""} ${last ?? ""}`.trim() || key);
    }

    const hasLoginEmail = realEmail !== null;
    if (!hasLoginEmail) {
      needsReview = true;
      reasons.push("Aucune adresse email personnelle — non contactable (à revoir).");
      noEmailPeople.push(`${first ?? ""} ${last ?? ""}`.trim());
    }
    if (isFounder) reasons.push("Fondateur — process dédié, hors sondage employés standard.");

    const email = realEmail ?? `no-email-${norm(first)}.${norm(last)}@matera.invalid`;

    // Build batches (vested / non-vested split, or voided).
    let ordinaryShares = 0;
    const batches: ParsedBatch[] = [];
    for (const r of grantRows) {
      const strike = toNum(get(r, "prixdexercice"));
      const granted = Math.round(toNum(get(r, "quantiteattribuee")));
      const exercised = Math.round(toNum(get(r, "quantiteexercee")));
      const caduque = Math.round(toNum(get(r, "quantitecaduque")));
      const vested = Math.round(toNum(get(r, "quantitevestee")));
      const exercisable = Math.round(toNum(get(r, "soldeexercable")));
      const nonVested = Math.round(toNum(get(r, "quantitenonvestee")));
      const inCirc = Math.round(toNum(get(r, "actualincirculation")));
      const lastPrice = toNum(get(r, "dernierprixparaction"));
      const title = str(get(r, "titre"));
      const attribution = toIsoDate(get(r, "datedattribution"));
      const expiration = toIsoDate(get(r, "datedexpirationoption"));
      const delegation = str(get(r, "delegation"));

      ordinaryShares += exercised;
      totalExercisable += exercisable;

      const meta: Record<string, number | null> = {
        granted, exercised, caduque, vested, exercisable, nonVested, inCirc, lastPrice,
      };

      if (exercisable <= 0 && nonVested <= 0) {
        // Nothing sellable — keep a voided record.
        batches.push({
          batch_name: title, strike_price: strike, quantity: 0, is_vested: false,
          status: "voided", attribution_date: attribution, expiration_date: expiration,
          delegation, meta,
        });
        batchesVoided++;
        continue;
      }
      if (exercisable > 0) {
        batches.push({
          batch_name: title, strike_price: strike, quantity: exercisable, is_vested: true,
          status: "active", attribution_date: attribution, expiration_date: expiration,
          delegation, meta,
        });
        batchesActive++;
      }
      if (nonVested > 0) {
        batches.push({
          batch_name: title, strike_price: strike, quantity: nonVested, is_vested: false,
          status: "active", attribution_date: attribution, expiration_date: expiration,
          delegation, meta,
        });
        batchesActive++;
      }
    }

    if (isFounder) founders.push(`${first ?? ""} ${last ?? ""}`.trim() || email);

    holders.push({
      email,
      hasLoginEmail,
      first_name: first,
      last_name: last,
      holder_type: holderType,
      employee_status: statusRaw,
      is_founder: isFounder,
      matricule,
      matera_email: materaEmail,
      contract_start_date: contractStart,
      ordinary_shares: ordinaryShares,
      needs_review: needsReview,
      reasons,
      batches,
    });
  }

  // --- Sheet1 departures ----------------------------------------------------
  const departures: PlannedDeparture[] = [];
  let departuresNoExt = 0;
  const departuresUnmatched: string[] = [];
  const holderEmails = new Set(holders.map((h) => h.email));

  const depSheet = wb.Sheets["Sheet1"] ?? wb.Sheets[wb.SheetNames.find((n) => norm(n) === "sheet1") ?? ""];
  if (depSheet) {
    const drows = sheetRows(depSheet);
    const DH = headerIndex(drows[0] ?? []);
    const dget = (row: unknown[], key: string): unknown => {
      const i = DH.get(key);
      return i === undefined ? null : row[i];
    };
    // Admin workflow columns -> jsonb.
    const adminKeys = (drows[0] ?? [])
      .map((h, i) => ({ name: str(h), i }))
      .filter((c) => c.name && norm(c.name).match(/decision|courrier|justificatif|envoi|uplaw/));

    for (const row of drows.slice(1)) {
      const email = str(dget(row, "email"))?.toLowerCase() ?? null;
      const firstName = str(dget(row, "prenom"));
      const lastName = str(dget(row, "nom"));
      if (!email && !firstName && !lastName) continue;

      const adminStatus: Record<string, unknown> = {};
      for (const c of adminKeys) adminStatus[c.name!] = row[c.i] ?? null;

      const dep: PlannedDeparture = {
        email: email ?? "",
        uplaw_id: str(row[0]), // col A header is blank
        gender: str(dget(row, "genre")),
        postal_address: str(dget(row, "adressepostale")),
        departure_date: toIsoDate(dget(row, "datededepart")),
        departure_cause: str(dget(row, "causededepart")),
        theoretical_deadline: toIsoDate(dget(row, "datedelimitetheorique")),
        exercise_deadline: toIsoDate(dget(row, "nouvellelimitedexercice")),
        bspce_granted: Math.round(toNum(dget(row, "nombredebspceoctroyees"))) || null,
        bspce_vested_at_notif:
          Math.round(toNum(dget(row, "nombredebspcevesteadatedenotifdudepart"))) || null,
        price_label: str(dget(row, "prix")),
        no_extension: dget(row, "nonprolongation") === true,
        admin_status: adminStatus,
      };
      if (dep.no_extension) departuresNoExt++;
      if (email && !holderEmails.has(email)) departuresUnmatched.push(email);
      departures.push(dep);
    }
  } else {
    warnings.push("Onglet « Sheet1 » (départs) introuvable — suivi des départs ignoré.");
  }

  const current = holders.filter((h) => h.holder_type === "current_employee").length;
  const ex = holders.filter((h) => h.holder_type === "ex_employee").length;

  const report: ImportReport = {
    holders: holders.length,
    holdersWithEmail: holders.filter((h) => h.hasLoginEmail).length,
    holdersNoEmail: holders.filter((h) => !h.hasLoginEmail).length,
    current,
    ex,
    unknownStatus: unknownStatusPeople.length,
    founders,
    noEmailPeople,
    unknownStatusPeople,
    batchesActive,
    batchesVoided,
    totalExercisableBalance: Math.round(totalExercisable),
    departures: departures.length,
    departuresNoExtension: departuresNoExt,
    departuresUnmatched,
  };

  return { holders, departures, report, warnings };
}

function emptyReport(): ImportReport {
  return {
    holders: 0, holdersWithEmail: 0, holdersNoEmail: 0, current: 0, ex: 0,
    unknownStatus: 0, founders: [], noEmailPeople: [], unknownStatusPeople: [],
    batchesActive: 0, batchesVoided: 0, totalExercisableBalance: 0,
    departures: 0, departuresNoExtension: 0, departuresUnmatched: [],
  };
}
