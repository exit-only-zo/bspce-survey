import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { resolvePrices, computeProceeds, fractionFromResponse } from "@/lib/pricing";
import { notifySlack } from "@/lib/slack";
import type { Batch, Holder, HolderOverride } from "@/lib/types";

// TEMPORARY — replays Slack notifications for responses received before the
// webhook was configured. Gated by ?key= and a time window (?minutes=, default
// 60). Remove after use. Hitting it twice WILL double-send.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") {
    return new NextResponse("not found", { status: 404 });
  }
  const minutes = Math.min(Math.max(Number(u.searchParams.get("minutes") ?? "60"), 1), 1440);
  const since = new Date(Date.now() - minutes * 60_000).toISOString();

  const svc = createServiceSupabase();
  const settings = await getSettings();
  const { data: resps } = await svc
    .from("survey_responses")
    .select("*")
    .gte("last_modified_at", since)
    .order("last_modified_at", { ascending: true });

  const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
  const sent: string[] = [];

  for (const r of resps ?? []) {
    const { data: holder } = await svc.from("holders").select("*").eq("id", r.holder_id).maybeSingle();
    if (!holder) continue;
    const h = holder as Holder;
    const { data: ov } = await svc.from("holder_overrides").select("*").eq("holder_id", h.id).maybeSingle();
    const { data: batchData } = await svc.from("batches").select("*").eq("holder_id", h.id);
    const prices = resolvePrices(settings, (ov as HolderOverride) ?? null);
    const fraction = fractionFromResponse(r);
    const pr = computeProceeds(
      { holder_type: h.holder_type, ordinary_shares: h.ordinary_shares },
      (batchData ?? []) as Batch[],
      prices,
      fraction,
    );
    const who = `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || h.email;
    const typeLabel = h.holder_type === "ex_employee" ? "ex-employé" : "employé actuel";
    const positive = r.response_mode === "binary" ? !!r.accepts_full_sale : (r.percentage_to_sell ?? 0) > 0;
    const answer =
      r.response_mode === "binary"
        ? r.accepts_full_sale
          ? "✅ Oui — cession 100 %"
          : "❌ Non intéressé"
        : positive
          ? `✅ ${r.percentage_to_sell} %`
          : "❌ Non (0 %)";
    const amountStr = positive
      ? pr.totalProceedsMin === pr.totalProceedsMax
        ? ` — ~${eur(pr.totalProceedsMax)} (${pr.totalTitlesOffered.toLocaleString("fr-FR")} titres)`
        : ` — ~${eur(pr.totalProceedsMin)}–${eur(pr.totalProceedsMax)} (${pr.totalTitlesOffered.toLocaleString("fr-FR")} titres)`
      : "";
    const when = new Date(r.last_modified_at).toISOString().slice(11, 16);
    await notifySlack(
      `📩 *Sondage BSPCE* _(rattrapage, ${when} UTC)_ — ${who} (${typeLabel}) a répondu : ${answer}${amountStr}`,
    );
    sent.push(who);
  }

  return NextResponse.json({ windowMinutes: minutes, count: sent.length, sent });
}
