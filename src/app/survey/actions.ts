"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings } from "@/lib/settings";
import { settingBool, settingNum } from "@/lib/settings-utils";
import { clientIp, userAgent, logAccess } from "@/lib/logging";
import {
  maxPctForHolder,
  exEmployeeBinaryMode,
  resolvePrices,
  computeProceeds,
  fractionFromResponse,
} from "@/lib/pricing";
import { cookies } from "next/headers";
import {
  DEMO_MODE,
  DEMO_RESPONSES_COOKIE,
  DEMO_MODREQS_COOKIE,
  parseDemoResponses,
  parseDemoModreqs,
} from "@/lib/demo";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { notifySlack } from "@/lib/slack";
import type { HolderOverride } from "@/lib/types";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 };

export interface SubmitResult {
  ok: boolean;
  error?: string;
  testMode?: boolean;
}

export interface SubmitInput {
  // For percentage mode (current employees, or ex-employees when not all-or-nothing).
  percentage?: number;
  // For binary mode (ex-employees, all-or-nothing).
  accepts?: boolean;
}

// Persists a holder's indication of interest.
//  - Enforces survey open + deadline server-side (never trust the client).
//  - In test mode, writes are stubbed (no DB mutation) but the flow succeeds.
//  - Upserts survey_responses (one per holder) and ALWAYS appends a
//    response_history row (full audit trail of every change).
export async function submitResponse(input: SubmitInput): Promise<SubmitResult> {
  const errs = t(getLang()).errors;
  const { holder, email } = await getSessionContext();
  if (!holder) return { ok: false, error: errs.session };
  if (!holder.nda_accepted_at) return { ok: false, error: errs.nda };

  const settings = await getSettings();

  // Survey open?
  if (!settingBool(settings.survey_open)) {
    return { ok: false, error: errs.closed };
  }
  // Deadline passed?
  const deadline = settings.survey_deadline ? new Date(settings.survey_deadline) : null;
  if (deadline && !Number.isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
    return { ok: false, error: errs.deadline };
  }

  let override: HolderOverride | null = null;
  if (!DEMO_MODE) {
    const svc = createServiceSupabase();
    const { data: overrideData } = await svc
      .from("holder_overrides")
      .select("*")
      .eq("holder_id", holder.id)
      .maybeSingle();
    override = (overrideData ?? null) as HolderOverride | null;
  }

  const isEx = holder.holder_type === "ex_employee";
  const useBinary = isEx && exEmployeeBinaryMode(settings);

  // Build the response payload, validating against the holder's mode + cap.
  let response_mode: "percentage" | "binary";
  let percentage_to_sell: number | null = null;
  let accepts_full_sale: boolean | null = null;

  if (useBinary) {
    if (typeof input.accepts !== "boolean") {
      return { ok: false, error: errs.selectAnswer };
    }
    response_mode = "binary";
    accepts_full_sale = input.accepts;
  } else {
    const cap = maxPctForHolder(holder.holder_type, settings, override);
    const pct = Math.round(input.percentage ?? -1);
    if (pct < 0 || pct > cap) {
      return { ok: false, error: errs.invalidPct };
    }
    response_mode = "percentage";
    percentage_to_sell = pct;
  }

  const now = new Date().toISOString();
  const ip = clientIp();
  const ua = userAgent();

  const LOCKED = errs.locked;

  // Demo mode: persist to the responses-map cookie keyed by holder email.
  if (DEMO_MODE) {
    const c = cookies();
    const responses = parseDemoResponses(c.get(DEMO_RESPONSES_COOKIE)?.value);
    const prev = responses[holder.email];
    if (prev && !prev.edit_unlocked) return { ok: false, error: LOCKED };

    responses[holder.email] = {
      id: `demo-${holder.email}`,
      holder_id: holder.id,
      response_mode,
      percentage_to_sell,
      accepts_full_sale,
      submitted_at: prev?.submitted_at ?? now,
      last_modified_at: now,
      ip_address: ip,
      user_agent: ua,
      edit_unlocked: false, // re-locked after each submit
    };
    c.set(DEMO_RESPONSES_COOKIE, JSON.stringify(responses), COOKIE_OPTS);

    // Clear any modification request (it has been fulfilled).
    const modreqs = parseDemoModreqs(c.get(DEMO_MODREQS_COOKIE)?.value);
    delete modreqs[holder.email];
    c.set(DEMO_MODREQS_COOKIE, JSON.stringify(modreqs), COOKIE_OPTS);

    revalidatePath("/survey");
    return { ok: true };
  }

  // Test mode: confirm UX without persisting.
  if (settingBool(settings.test_mode)) {
    await logAccess(email, "/survey:submit(test)");
    return { ok: true, testMode: true };
  }

  const svc = createServiceSupabase();

  // Existing response? Enforce the lock: editing requires an admin-approved
  // unlock. Also preserves submitted_at and decides created vs modified.
  const { data: existing } = await svc
    .from("survey_responses")
    .select("id, submitted_at, edit_unlocked")
    .eq("holder_id", holder.id)
    .maybeSingle();

  if (existing && !existing.edit_unlocked) return { ok: false, error: LOCKED };

  const submitted_at = existing?.submitted_at ?? now;

  const row = {
    holder_id: holder.id,
    response_mode,
    percentage_to_sell,
    accepts_full_sale,
    submitted_at,
    last_modified_at: now,
    ip_address: ip,
    user_agent: ua,
    edit_unlocked: false, // re-locked after each submit
  };

  const { error: upErr } = await svc
    .from("survey_responses")
    .upsert(row, { onConflict: "holder_id" });
  if (upErr) return { ok: false, error: `Échec de l'enregistrement: ${upErr.message}` };

  // The modification request (if any) is now fulfilled.
  await svc.from("modification_requests").delete().eq("holder_id", holder.id);

  // Append to audit trail.
  await svc.from("response_history").insert({
    holder_id: holder.id,
    snapshot: { response_mode, percentage_to_sell, accepts_full_sale, submitted_at, last_modified_at: now },
    ip_address: ip,
    change_type: existing ? "modified" : "created",
  });

  await logAccess(email, existing ? "/survey:modify" : "/survey:submit");

  // Best-effort Slack ping so the deal team sees responses land in real time.
  const who = `${holder.first_name ?? ""} ${holder.last_name ?? ""}`.trim() || holder.email;
  const typeLabel = isEx ? "ex-employé" : "employé actuel";
  const positive = response_mode === "binary" ? !!accepts_full_sale : (percentage_to_sell ?? 0) > 0;
  const answer =
    response_mode === "binary"
      ? accepts_full_sale
        ? "✅ Oui — cession 100 %"
        : "❌ Non intéressé"
      : positive
        ? `✅ ${percentage_to_sell} %`
        : "❌ Non (0 %)";

  // Indicative proceeds for this response (same engine as the survey page).
  let amountStr = "";
  if (positive) {
    try {
      const { data: batchData } = await svc.from("batches").select("*").eq("holder_id", holder.id);
      const prices = resolvePrices(settings, override);
      const fraction = fractionFromResponse({ response_mode, percentage_to_sell, accepts_full_sale });
      const pr = computeProceeds(
        { holder_type: holder.holder_type, ordinary_shares: holder.ordinary_shares },
        batchData ?? [],
        prices,
        fraction,
      );
      const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
      amountStr =
        pr.totalProceedsMin === pr.totalProceedsMax
          ? ` — ~${eur(pr.totalProceedsMax)} (${pr.totalTitlesOffered.toLocaleString("fr-FR")} titres)`
          : ` — ~${eur(pr.totalProceedsMin)}–${eur(pr.totalProceedsMax)} (${pr.totalTitlesOffered.toLocaleString("fr-FR")} titres)`;
    } catch {
      // amount is best-effort; never block the notification on it.
    }
  }

  await notifySlack(
    `📩 *Sondage BSPCE* — ${who} (${typeLabel}) ${existing ? "a modifié sa réponse" : "a répondu"} : ${answer}${amountStr}`,
  );

  revalidatePath("/survey");
  return { ok: true };
}

// A holder asks to modify their (locked) response. Creates a pending request
// that an admin must approve before the response can be edited.
export async function requestModification(): Promise<SubmitResult> {
  const { holder } = await getSessionContext();
  if (!holder) return { ok: false, error: t(getLang()).errors.session };

  const now = new Date().toISOString();

  if (DEMO_MODE) {
    const c = cookies();
    const modreqs = parseDemoModreqs(c.get(DEMO_MODREQS_COOKIE)?.value);
    modreqs[holder.email] = {
      holder_id: holder.id,
      status: "pending",
      note: null,
      created_at: now,
      resolved_at: null,
      resolved_by: null,
    };
    c.set(DEMO_MODREQS_COOKIE, JSON.stringify(modreqs), COOKIE_OPTS);
    revalidatePath("/survey");
    return { ok: true };
  }

  const svc = createServiceSupabase();
  const { error } = await svc.from("modification_requests").upsert(
    { holder_id: holder.id, status: "pending", created_at: now, resolved_at: null, resolved_by: null },
    { onConflict: "holder_id" },
  );
  if (error) return { ok: false, error: `Échec: ${error.message}` };

  const who = `${holder.first_name ?? ""} ${holder.last_name ?? ""}`.trim() || holder.email;
  await notifySlack(`✏️ *Sondage BSPCE* — ${who} demande à modifier sa réponse (à valider en admin).`);

  revalidatePath("/survey");
  return { ok: true };
}
