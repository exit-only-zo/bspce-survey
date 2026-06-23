import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildImportPlan } from "@/lib/import/parse";
import type { Batch, DepartureTracking, Holder } from "@/lib/types";

// ===========================================================================
// DEMO data backed by the real BSPCE 2026 file.
// ===========================================================================
// In demo mode there is no database, so we parse the workbook in `Data-import/`
// at runtime and serve the real holders/batches/departures from memory. This
// lets the admin browse the actual roster and impersonate any holder's survey.
// The email is the natural key (synthetic for no-email holders).
// ===========================================================================

interface DemoData {
  holders: Holder[];
  byEmail: Map<string, Holder>;
  byToken: Map<string, Holder>;
  batchesByEmail: Map<string, Batch[]>;
  departuresByEmail: Map<string, DepartureTracking>;
}

// Stable, URL-safe demo token derived from the email (local preview only).
function demoToken(email: string): string {
  return "demo_" + Buffer.from(email).toString("base64url");
}

let cache: DemoData | null | undefined;

function findFile(): string | null {
  const dir = join(process.cwd(), "Data-import");
  if (!existsSync(dir)) return null;
  const xlsx = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
  return xlsx ? join(dir, xlsx) : null;
}

export function getDemoData(): DemoData {
  if (cache !== undefined && cache !== null) return cache;

  const empty: DemoData = {
    holders: [],
    byEmail: new Map(),
    byToken: new Map(),
    batchesByEmail: new Map(),
    departuresByEmail: new Map(),
  };

  const file = findFile();
  if (!file) {
    cache = empty;
    return empty;
  }

  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const plan = buildImportPlan(ab);

  const holders: Holder[] = [];
  const byEmail = new Map<string, Holder>();
  const byToken = new Map<string, Holder>();
  const batchesByEmail = new Map<string, Batch[]>();

  plan.holders.forEach((h) => {
    const holder: Holder = {
      id: h.email, // email is the demo natural key
      email: h.email,
      first_name: h.first_name,
      last_name: h.last_name,
      holder_type: h.holder_type,
      ordinary_shares: h.ordinary_shares,
      nda_accepted_at: null, // first visit shows the NDA, like the real flow
      data_as_of: "2026-06-22",
      employee_status: h.employee_status,
      is_founder: h.is_founder,
      matricule: h.matricule,
      matera_email: h.matera_email,
      contract_start_date: h.contract_start_date,
      needs_review: h.needs_review,
      has_login_email: h.hasLoginEmail,
      access_token: demoToken(h.email),
      created_at: "2026-06-22T00:00:00Z",
      updated_at: "2026-06-22T00:00:00Z",
    };
    holders.push(holder);
    byEmail.set(holder.email, holder);
    byToken.set(holder.access_token!, holder);
    batchesByEmail.set(
      holder.email,
      h.batches.map((b, i) => ({
        id: `${holder.email}#${i}`,
        holder_id: holder.email,
        batch_name: b.batch_name,
        strike_price: b.strike_price,
        quantity: b.quantity,
        is_vested: b.is_vested,
        status: b.status,
        attribution_date: b.attribution_date,
        expiration_date: b.expiration_date,
        delegation: b.delegation,
        meta: b.meta,
      })),
    );
  });

  const departuresByEmail = new Map<string, DepartureTracking>();
  for (const d of plan.departures) {
    if (!d.email) continue;
    departuresByEmail.set(d.email, {
      holder_id: d.email,
      uplaw_id: d.uplaw_id,
      gender: d.gender,
      postal_address: d.postal_address,
      departure_date: d.departure_date,
      departure_cause: d.departure_cause,
      theoretical_deadline: d.theoretical_deadline,
      exercise_deadline: d.exercise_deadline,
      bspce_granted: d.bspce_granted,
      bspce_vested_at_notif: d.bspce_vested_at_notif,
      price_label: d.price_label,
      no_extension: d.no_extension,
      admin_status: d.admin_status,
    });
  }

  cache = { holders, byEmail, byToken, batchesByEmail, departuresByEmail };
  return cache;
}

export function getDemoHolderByEmail(email: string): Holder | null {
  return getDemoData().byEmail.get(email.toLowerCase()) ?? null;
}

export function getDemoHolderByToken(token: string): Holder | null {
  return getDemoData().byToken.get(token) ?? null;
}

export function getDemoBatches(email: string): Batch[] {
  return getDemoData().batchesByEmail.get(email.toLowerCase()) ?? [];
}
