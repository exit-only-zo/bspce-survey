import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { computeDashboard } from "@/lib/dashboard";
import { notifySlack } from "@/lib/slack";

// TEMPORARY — build/send a Slack recap. ?key= gates; ?send=1 actually posts
// (otherwise returns a preview). Remove after use.
export const dynamic = "force-dynamic";

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// People contacted (excluding Jean-Gabriel, per request).
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

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") return new NextResponse("not found", { status: 404 });

  const svc = createServiceSupabase();
  const settings = await getSettings();
  const dash = await computeDashboard(settings);

  const holders = (await svc.from("holders").select("id,first_name,last_name").then((r) => r.data ?? [])) as {
    id: string; first_name: string | null; last_name: string | null;
  }[];
  const respIds = new Set((await svc.from("survey_responses").select("holder_id").then((r) => r.data ?? [])).map((x) => x.holder_id));

  const noResp: string[] = [];
  let respondedCount = 0;
  for (const [fn, ln] of CONTACTED) {
    const cands = holders.filter((h) => norm(h.last_name ?? "") === norm(ln));
    const h = cands.length === 1 ? cands[0] : cands.find((c) => norm(c.first_name ?? "") === norm(fn));
    if (!h) { noResp.push(`${fn} ${ln} (?)`); continue; }
    if (respIds.has(h.id)) respondedCount++;
    else noResp.push(`${fn} ${ln}`);
  }
  const contacted = CONTACTED.length;

  const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
  const num = (n: number) => n.toLocaleString("fr-FR");

  const main =
    `📊 *Récap sondage BSPCE*\n` +
    `💰 Cumul intéressés (versé aux détenteurs) : *~${eur(dash.totalProceedsMax)}*\n` +
    `📈 Titres indiqués à la vente : *${num(dash.totalTitlesForSale)}*\n` +
    `✅ Réponses : *${respondedCount} / ${contacted}* contactés (hors Jean-Gabriel)\n` +
    `🏦 Trésorerie apportée à Matera (exercice des BSPCE, hors actions déjà exercées) : *~${eur(dash.materaCashIn)}*`;

  // Per-respondent breakdown: name · titres · montant, biggest first.
  const respLines = dash.rows
    .filter((r) => r.hasResponse)
    .sort((a, b) => b.proceedsMax - a.proceedsMax)
    .map((r) => `• ${r.name} · ${num(r.titlesOffered)} titres · ${eur(r.proceedsMax)}`);

  // Chunk into messages of 40 lines to stay under Slack limits.
  const chunks: string[] = [];
  for (let i = 0; i < respLines.length; i += 40) {
    const part = respLines.slice(i, i + 40).join("\n");
    const header = i === 0 ? `*Détail par répondant (${respLines.length})*\n` : "";
    chunks.push(header + part);
  }
  const comment = `🕗 Sans réponse (${noResp.length}) : ${noResp.join(", ")}`;

  const send = u.searchParams.get("send") === "1";
  if (send) {
    await notifySlack(main);
    for (const c of chunks) await notifySlack(c);
    await notifySlack(comment);
  }
  return NextResponse.json({
    sent: send,
    preview_main: main,
    preview_detail: chunks,
    preview_comment: comment,
    contacted,
    respondedCount,
    noResp,
  });
}
