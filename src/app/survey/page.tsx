import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getSettings, settingBool } from "@/lib/settings";
import { logAccess } from "@/lib/logging";
import {
  resolvePrices,
  maxPctForHolder,
  exEmployeeBinaryMode,
  currentEmployeeSliderBounds,
  summarizeHoldings,
  minPctCurrent,
} from "@/lib/pricing";
import { getLang } from "@/lib/lang";
import { t, fmtDateLong } from "@/lib/i18n";
import { Watermark, ConfidentialFooter, ConfidentialBody } from "@/components/Confidential";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ResponseForm from "./ResponseForm";
import { cookies } from "next/headers";
import {
  DEMO_MODE,
  DEMO_RESPONSES_COOKIE,
  DEMO_MODREQS_COOKIE,
  parseDemoResponses,
  parseDemoModreqs,
} from "@/lib/demo";
import { getDemoBatches } from "@/lib/demo-data";
import { signOut } from "@/app/auth/logout-action";
import { demoLogout } from "@/app/login/demo-actions";
import { stopImpersonating } from "@/app/admin/holders/actions";
import type { Batch, HolderOverride, SurveyResponse, ModificationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SurveyPage() {
  const { email, isAdmin, holder, impersonating } = await getSessionContext();
  if (!email) redirect("/login");
  if (isAdmin) redirect("/admin");
  if (!holder) redirect("/login");
  if (!holder.nda_accepted_at) redirect("/nda");

  await logAccess(email, "/survey");

  let batches: Batch[];
  let override: HolderOverride | null;
  let existing: SurveyResponse | null;
  let requestStatus: ModificationStatus | null = null;
  const settings = await getSettings();

  if (DEMO_MODE) {
    batches = getDemoBatches(holder.email);
    override = null;
    const responses = parseDemoResponses(cookies().get(DEMO_RESPONSES_COOKIE)?.value);
    existing = responses[holder.email] ?? null;
    const modreqs = parseDemoModreqs(cookies().get(DEMO_MODREQS_COOKIE)?.value);
    requestStatus = modreqs[holder.email]?.status ?? null;
  } else {
    const svc = createServiceSupabase();
    const [{ data: batchData }, { data: overrideData }, { data: responseData }, { data: reqData }] =
      await Promise.all([
        svc.from("batches").select("*").eq("holder_id", holder.id),
        svc.from("holder_overrides").select("*").eq("holder_id", holder.id).maybeSingle(),
        svc.from("survey_responses").select("*").eq("holder_id", holder.id).maybeSingle(),
        svc.from("modification_requests").select("status").eq("holder_id", holder.id).maybeSingle(),
      ]);
    batches = (batchData ?? []) as Batch[];
    override = (overrideData ?? null) as HolderOverride | null;
    existing = (responseData ?? null) as SurveyResponse | null;
    requestStatus = (reqData?.status as ModificationStatus) ?? null;
  }
  const unlocked = !!existing?.edit_unlocked;
  const prices = resolvePrices(settings, override);

  const isEx = holder.holder_type === "ex_employee";
  const useBinary = isEx && exEmployeeBinaryMode(settings);

  // Slider bounds: current employees get the configured [min, max] range with
  // max clamped to the % actually vested; ex-employee fallback keeps a 0..cap.
  const bounds = isEx
    ? { min: 0, max: maxPctForHolder("ex_employee", settings, override) }
    : currentEmployeeSliderBounds(settings, batches, prices, override);
  const holdings = summarizeHoldings(batches, holder.holder_type, prices);

  // Ex-employees see an indicative RANGE spanning their applicable prices
  // (unvested → vested, widened by any configured _max). Current employees see
  // their single price band.
  const headline = isEx
    ? {
        min: Math.min(prices.exVested.min, prices.exUnvested.min),
        max: Math.max(prices.exVested.max, prices.exUnvested.max),
      }
    : prices.current;

  // Survey state.
  const surveyOpen = settingBool(settings.survey_open);
  const deadlineRaw = settings.survey_deadline ? new Date(settings.survey_deadline) : null;
  const deadlinePassed =
    !!deadlineRaw && !Number.isNaN(deadlineRaw.getTime()) && Date.now() > deadlineRaw.getTime();
  const editable = surveyOpen && !deadlinePassed;

  const lang = getLang();
  const tr = t(lang);
  const deadlineLabel = fmtDateLong(settings.survey_deadline, lang);
  const refreshed = fmtDateLong(settings.data_last_refreshed_at, lang);
  const support = settings.support_email ?? "bspce-2026@matera.eu";
  const testMode = settingBool(settings.test_mode);

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <div className="relative min-h-screen">
      <ConfidentialBody />
      <Watermark email={email} stamp={stamp} />
      <main className="relative z-10 mx-auto max-w-2xl px-5 py-8">
        {impersonating && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-matera-ink px-4 py-2 text-sm text-white">
            <span>{tr.survey.adminPreview(holder.email)}</span>
            <form action={stopImpersonating}>
              <button className="rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10">
                {tr.survey.backAdmin}
              </button>
            </form>
          </div>
        )}
        {testMode && (
          <div className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            {tr.survey.testBanner}
          </div>
        )}

        {settings.webinar_info && (
          <div className="mb-4 rounded-lg border border-matera-primary/30 bg-blue-50 px-4 py-3 text-sm text-matera-ink">
            {settings.webinar_info}
          </div>
        )}

        <header className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-matera-ink">
            {tr.survey.hello(holder.first_name ?? "")}
          </h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher current={lang} />
            <Link href="/faq" className="text-sm text-matera-primary hover:underline">
              {tr.survey.help}
            </Link>
          </div>
        </header>
        <div className="mt-1 space-y-0.5 text-xs text-matera-muted">
          {deadlineLabel && <p>{tr.survey.replyUntil(deadlineLabel)}</p>}
          {refreshed && <p>{tr.survey.dataAsOf(refreshed)}</p>}
        </div>

        <div className="mt-6">
          <ResponseForm
            lang={lang}
            firstName={holder.first_name ?? ""}
            isEx={isEx}
            useBinary={useBinary}
            sliderMin={bounds.min}
            sliderMax={bounds.max}
            rangeMin={minPctCurrent(settings)}
            rangeMax={maxPctForHolder("current_employee", settings, override)}
            holdings={holdings}
            holderType={holder.holder_type}
            ordinaryShares={holder.ordinary_shares}
            batches={batches}
            prices={prices}
            headline={{ min: headline.min, max: headline.max }}
            deadlineLabel={deadlineLabel}
            supportEmail={support}
            editable={editable}
            unlocked={unlocked}
            requestStatus={requestStatus}
            existing={
              existing
                ? {
                    response_mode: existing.response_mode,
                    percentage_to_sell: existing.percentage_to_sell,
                    accepts_full_sale: existing.accepts_full_sale,
                    last_modified_at: existing.last_modified_at,
                  }
                : null
            }
          />
        </div>

        {!impersonating && (
          <form action={DEMO_MODE ? demoLogout : signOut} className="mt-6 text-center">
            <button className="text-xs text-matera-muted underline hover:text-matera-ink">
              {DEMO_MODE ? tr.survey.resetDemo : tr.survey.logout}
            </button>
          </form>
        )}

        <ConfidentialFooter lang={lang} />
      </main>
    </div>
  );
}
