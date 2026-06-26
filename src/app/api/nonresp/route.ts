import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { resolvePrices, computeProceeds } from "@/lib/pricing";
import { notifySlack } from "@/lib/slack";
import type { Batch, Holder, HolderOverride } from "@/lib/types";

// TEMPORARY — Slack message: potential (100% sale) for the non-responders.
// ?key= gates; ?send=1 posts, else preview. Remove after use.
export const dynamic = "force-dynamic";

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const CONTACTED = `Eléonore|Breton
Marine|DE VILLOUTREYS
Théo|Sarda
Diana|MARTINS
Guillaume|ROCHE-BAYARD
David|MACHULKA
Claire|MAFFEI
Gabrielle|BOO D'ARC
Louis|Frémont
Théo|BOSSOUTROT
Camille|BROSSOLLET
Fabien|DOBAT
Pierre|SPETTEL
Philippe|DE MONTAGU
Claire|PAREJA
Alexis|HERRIAU
Victor|LACOMBE
Anojh|RAVEENDRARAJAH
Octavie|DE BOUARD SARRABEZOLLES
Thierry|Tranchant
Hortense|MILLERAND
Manon|BRUNEL
Benjamin|LAFAURIE
Romain|TOMMASINI
Jules|BONNIAUD
Paul-Henri|DESPREZ
Arthur|BUGEON
Auriane|ROUSSEL
Alexandre|DERVILLE
Pauline|BRUNSCHWIG
Emma|BLEIN
Clarisse|PINAULT
Paul|COUSIN
Anatole|Denis
Jérémy|Abeille-Pignède
Bastien|MARTIN
Lucia|Luengo Mosso
Maxime|NOEL
Axelle|COMACLE
Tom|ECREPONT
Louis|LEMAIRE
Manon|POIRIÉ
Nicolas|NOAILLES
Constance|PROTAIS
Samuel|BOUKEZZI
Gauthier|CASANOVA
Amaury|GUITTON
Cécile|MERCIER
Chloe|HARMANT
Marguerite|GARON
Loredana|VESTEMEANU
Ilona|HERNANDEZ
Pierre|BORDIS
Manon|BERNÈS
Michel|OSTROVSKI
Mickaël|PY
Laura|DUDILIEU
Sumer|Longet
Laurent|MICHELET
Sophie|AULITZKY
Evgenia|DOBROVINSKA
Gero|GRAF
Luca|Gronimus
Philip|Gruene
Jaideep|Gulia
Noemie|Himmelreich
Jorge|JULI GIL
Maximilian|Kück
Tabea|MANGOLD
Alexander|MENSE
Burak|Özdalyan
Roman|REMIS
Janine|SCHLAAK
Finn|UKENA
Emanuel|VON AULOCK
Marcus|VON WREDE
Philippa|Waldburg
Sören|ZISCHKE`.split("\n").map((l) => l.split("|"));

async function fetchAll<T>(svc: ReturnType<typeof createServiceSupabase>, table: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await svc.from(table).select("*").range(from, from + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") return new NextResponse("not found", { status: 404 });

  const svc = createServiceSupabase();
  const settings = await getSettings();
  const holders = await fetchAll<Holder>(svc, "holders");
  const batches = await fetchAll<Batch>(svc, "batches");
  const overrides = await fetchAll<HolderOverride>(svc, "holder_overrides");
  const respIds = new Set((await svc.from("survey_responses").select("holder_id").then((r) => r.data ?? [])).map((x) => x.holder_id));

  const batchesByHolder = new Map<string, Batch[]>();
  for (const b of batches) { const a = batchesByHolder.get(b.holder_id) ?? []; a.push(b); batchesByHolder.set(b.holder_id, a); }
  const ovByHolder = new Map<string, HolderOverride>();
  for (const o of overrides) ovByHolder.set(o.holder_id, o);

  const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
  const num = (n: number) => n.toLocaleString("fr-FR");

  const rows: { name: string; titles: number; montant: number; treso: number }[] = [];
  for (const [fn, ln] of CONTACTED) {
    const cands = holders.filter((h) => norm(h.last_name ?? "") === norm(ln));
    const h = cands.length === 1 ? cands[0] : cands.find((c) => norm(c.first_name ?? "") === norm(fn));
    if (!h || respIds.has(h.id)) continue; // skip responders + unmatched
    const prices = resolvePrices(settings, ovByHolder.get(h.id) ?? null);
    const pr = computeProceeds(h, batchesByHolder.get(h.id) ?? [], prices, 1);
    const treso = pr.batches.reduce((s, b) => s + b.batch.strike_price * b.offeredQuantity, 0);
    rows.push({ name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || h.email, titles: pr.totalTitlesOffered, montant: pr.totalProceedsMax, treso });
  }
  rows.sort((a, b) => b.montant - a.montant);

  const tT = rows.reduce((s, r) => s + r.titles, 0);
  const tM = rows.reduce((s, r) => s + r.montant, 0);
  const tTr = rows.reduce((s, r) => s + r.treso, 0);

  const msg =
    `🕗 *Sans réponse — potentiel si participation (${rows.length})*\n` +
    rows.map((r) => `• ${r.name} · ${num(r.titles)} titres · ${eur(r.montant)}`).join("\n") +
    `\n\n*Total potentiel* : ${num(tT)} titres · ~${eur(tM)} (versé aux détenteurs)\n` +
    `🏦 Trésorerie Matera potentielle : ~${eur(tTr)}`;

  const send = u.searchParams.get("send") === "1";
  if (send) await notifySlack(msg);
  return NextResponse.json({ sent: send, preview: msg, count: rows.length, totalTitles: tT, totalMontant: tM, totalTreso: tTr });
}
