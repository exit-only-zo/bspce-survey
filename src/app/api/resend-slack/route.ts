import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { resolvePrices, computeProceeds, fractionFromResponse } from "@/lib/pricing";
import { computeDashboard } from "@/lib/dashboard";
import { notifySlack } from "@/lib/slack";
import type { Batch, Holder, HolderOverride } from "@/lib/types";

// TEMPORARY — re-send Slack notifications for specific holders (?emails=a,b),
// e.g. after a data correction. Gated by ?key=. Remove after use.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") return new NextResponse("not found", { status: 404 });
  const emails = (u.searchParams.get("emails") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return NextResponse.json({ error: "no emails" });

  const svc = createServiceSupabase();
  const settings = await getSettings();
  const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
  const num = (n: number) => n.toLocaleString("fr-FR");
  const sent: string[] = [];

  for (const email of emails) {
    const { data: holder } = await svc.from("holders").select("*").eq("email", email).maybeSingle();
    if (!holder) { sent.push(`${email}: introuvable`); continue; }
    const h = holder as Holder;
    const { data: resp } = await svc.from("survey_responses").select("*").eq("holder_id", h.id).maybeSingle();
    if (!resp) { sent.push(`${email}: pas de réponse`); continue; }
    const { data: ov } = await svc.from("holder_overrides").select("*").eq("holder_id", h.id).maybeSingle();
    const { data: batchData } = await svc.from("batches").select("*").eq("holder_id", h.id);
    const prices = resolvePrices(settings, (ov as HolderOverride) ?? null);
    const fraction = fractionFromResponse(resp);
    const pr = computeProceeds({ holder_type: h.holder_type, ordinary_shares: h.ordinary_shares }, (batchData ?? []) as Batch[], prices, fraction);
    const who = `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || h.email;
    const typeLabel = h.holder_type === "ex_employee" ? "ex-employé" : "employé actuel";
    const positive = resp.response_mode === "binary" ? !!resp.accepts_full_sale : (resp.percentage_to_sell ?? 0) > 0;
    const answer = resp.response_mode === "binary"
      ? (resp.accepts_full_sale ? "✅ Oui — cession 100 %" : "❌ Non intéressé")
      : (positive ? `✅ ${resp.percentage_to_sell} %` : "❌ Non (0 %)");
    const amountStr = positive
      ? (pr.totalProceedsMin === pr.totalProceedsMax
          ? ` — ~${eur(pr.totalProceedsMax)} (${num(pr.totalTitlesOffered)} titres)`
          : ` — ~${eur(pr.totalProceedsMin)}–${eur(pr.totalProceedsMax)} (${num(pr.totalTitlesOffered)} titres)`)
      : "";
    let cumStr = "";
    try {
      const d = await computeDashboard(settings);
      cumStr = `\n💰 Cumul intéressés : ~${eur(d.totalProceedsMax)} · ${num(d.totalTitlesForSale)} titres · ${d.totals.respondents} réponses`;
    } catch {}
    await notifySlack(`📩 *Sondage BSPCE* _(renvoi corrigé)_ — ${who} (${typeLabel}) a répondu : ${answer}${amountStr}${cumStr}`);
    sent.push(`${who}: ${answer}${amountStr}`);
  }
  return NextResponse.json({ sent });
}
