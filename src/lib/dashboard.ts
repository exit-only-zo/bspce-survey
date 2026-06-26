import "server-only";
import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  resolvePrices,
  computeProceeds,
  fractionFromResponse,
} from "@/lib/pricing";
import {
  DEMO_MODE,
  DEMO_RESPONSES_COOKIE,
  DEMO_MODREQS_COOKIE,
  parseDemoResponses,
  parseDemoModreqs,
} from "@/lib/demo";
import { getDemoData } from "@/lib/demo-data";
import type {
  Batch,
  Holder,
  HolderOverride,
  ModificationStatus,
  Settings,
  SurveyResponse,
} from "@/lib/types";

export interface DashboardRow {
  holderId: string;
  name: string;
  email: string;
  type: "current_employee" | "ex_employee";
  employeeStatus: string | null;
  isFounder: boolean;
  needsReview: boolean;
  hasLoginEmail: boolean;
  accessToken: string | null;
  totalWarrants: number;
  ordinaryShares: number;
  maxCessible: number; // max titles the holder could actually sell (pool at 100%)
  responseLabel: string; // human-readable response
  hasResponse: boolean;
  requestStatus: ModificationStatus | null;
  titlesOffered: number;
  proceedsMin: number;
  proceedsMax: number;
  submittedAt: string | null;
  lastModifiedAt: string | null;
  hasOverride: boolean;
}

export interface Dashboard {
  isRange: boolean;
  totals: { holders: number; respondents: number; rate: number };
  byType: {
    current: { holders: number; respondents: number; rate: number };
    ex: { holders: number; respondents: number; rate: number };
  };
  totalTitlesForSale: number;
  totalProceedsMin: number;
  totalProceedsMax: number;
  avgPctCurrent: number | null;
  histogram: { label: string; count: number }[];
  exPie: { yes: number; no: number; pending: number };
  timeseries: { date: string; cumulative: number }[];
  rows: DashboardRow[];
}

interface RawData {
  holders: Holder[];
  batchesByHolder: Map<string, Batch[]>;
  overrideByHolder: Map<string, HolderOverride>;
  responseByHolder: Map<string, SurveyResponse>;
  requestByHolder: Map<string, ModificationStatus>;
}

// Supabase/PostgREST caps a single response at 1000 rows. With 1300+ batches,
// an unbounded select silently truncates, making some holders' warrants read as
// 0 and undercounting all aggregate totals. Page through with .range() until the
// table is fully read.
const PAGE = 1000;
async function fetchAll<T>(
  svc: ReturnType<typeof createServiceSupabase>,
  table: string,
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetchAll(${table}) failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function loadData(): Promise<RawData> {
  if (DEMO_MODE) {
    const data = getDemoData();
    const c = cookies();
    const responsesMap = parseDemoResponses(c.get(DEMO_RESPONSES_COOKIE)?.value);
    const responseByHolder = new Map<string, SurveyResponse>();
    for (const [email, resp] of Object.entries(responsesMap)) {
      responseByHolder.set(email, resp);
    }
    const requestByHolder = new Map<string, ModificationStatus>();
    for (const [email, req] of Object.entries(parseDemoModreqs(c.get(DEMO_MODREQS_COOKIE)?.value))) {
      requestByHolder.set(email, req.status);
    }
    return {
      holders: data.holders,
      batchesByHolder: data.batchesByEmail,
      overrideByHolder: new Map(),
      responseByHolder,
      requestByHolder,
    };
  }

  const svc = createServiceSupabase();
  const [holders, batches, overrides, responses, requests] = await Promise.all([
    fetchAll<Holder>(svc, "holders", "*"),
    fetchAll<Batch>(svc, "batches", "*"),
    fetchAll<HolderOverride>(svc, "holder_overrides", "*"),
    fetchAll<SurveyResponse>(svc, "survey_responses", "*"),
    fetchAll<{ holder_id: string; status: ModificationStatus }>(
      svc,
      "modification_requests",
      "holder_id, status",
    ),
  ]);

  const batchesByHolder = new Map<string, Batch[]>();
  for (const b of batches) {
    const arr = batchesByHolder.get(b.holder_id) ?? [];
    arr.push(b);
    batchesByHolder.set(b.holder_id, arr);
  }
  const overrideByHolder = new Map<string, HolderOverride>();
  for (const o of overrides) {
    overrideByHolder.set(o.holder_id, o);
  }
  const responseByHolder = new Map<string, SurveyResponse>();
  for (const r of responses) {
    responseByHolder.set(r.holder_id, r);
  }
  const requestByHolder = new Map<string, ModificationStatus>();
  for (const r of requests) {
    requestByHolder.set(r.holder_id, r.status);
  }

  return {
    holders,
    batchesByHolder,
    overrideByHolder,
    responseByHolder,
    requestByHolder,
  };
}

function histogramBuckets(): { label: string; test: (p: number) => boolean }[] {
  return [
    { label: "0 %", test: (p) => p === 0 },
    { label: "1–10 %", test: (p) => p >= 1 && p <= 10 },
    { label: "11–20 %", test: (p) => p >= 11 && p <= 20 },
    { label: "21–30 %", test: (p) => p >= 21 && p <= 30 },
    { label: "31–50 %", test: (p) => p >= 31 && p <= 50 },
    { label: "51–99 %", test: (p) => p >= 51 && p <= 99 },
    { label: "100 %", test: (p) => p === 100 },
  ];
}

// Compute the full dashboard. All figures derive from the live `settings`, so
// changing prices/caps in Settings and reloading recomputes everything.
export async function computeDashboard(settings: Settings): Promise<Dashboard> {
  const data = await loadData();

  // Internal test responses are ignored so they don't inflate counts, totals or
  // the Slack cumulative. Two mechanisms:
  //  - responses_excluded_holders: explicit holder IDs to drop (precise).
  //  - responses_cutoff_at: drop anything submitted before this ISO time (blunt).
  const excluded = new Set(
    (settings.responses_excluded_holders ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  for (const id of excluded) data.responseByHolder.delete(id);

  const cutoff = settings.responses_cutoff_at ? Date.parse(settings.responses_cutoff_at) : NaN;
  if (!Number.isNaN(cutoff)) {
    for (const [holderId, r] of data.responseByHolder) {
      const t = Date.parse(r.submitted_at ?? r.last_modified_at ?? "");
      if (!Number.isNaN(t) && t < cutoff) data.responseByHolder.delete(holderId);
    }
  }

  let respondents = 0;
  let curHolders = 0;
  let curResp = 0;
  let exHolders = 0;
  let exResp = 0;
  let totalTitles = 0;
  let totalMin = 0;
  let totalMax = 0;
  let isRange = false;

  const curPcts: number[] = [];
  const exPie = { yes: 0, no: 0, pending: 0 };
  const rows: DashboardRow[] = [];
  const dateCounts = new Map<string, number>();

  for (const holder of data.holders) {
    const batches = data.batchesByHolder.get(holder.id) ?? [];
    const override = data.overrideByHolder.get(holder.id) ?? null;
    const response = data.responseByHolder.get(holder.id) ?? null;
    const prices = resolvePrices(settings, override);

    const isCurrent = holder.holder_type === "current_employee";
    if (isCurrent) curHolders++;
    else exHolders++;

    const totalWarrants = batches
      .filter((b) => b.status === "active")
      .reduce((s, b) => s + b.quantity, 0);

    let responseLabel = "En attente";
    let fraction = 0;

    if (response) {
      respondents++;
      if (isCurrent) curResp++;
      else exResp++;

      fraction = fractionFromResponse(response);
      if (response.response_mode === "percentage") {
        responseLabel = `${response.percentage_to_sell ?? 0} %`;
        if (isCurrent) curPcts.push(response.percentage_to_sell ?? 0);
      } else {
        responseLabel = response.accepts_full_sale ? "Oui (100 %)" : "Non";
      }
      if (!isCurrent) {
        if (response.accepts_full_sale) exPie.yes++;
        else exPie.no++;
      }

      const day = (response.last_modified_at ?? response.submitted_at ?? "").slice(0, 10);
      if (day) dateCounts.set(day, (dateCounts.get(day) ?? 0) + 1);
    } else if (!isCurrent) {
      exPie.pending++;
    }

    const proceeds = computeProceeds(holder, batches, prices, fraction);
    // Max sellable pool (fraction = 1): vested-only for current employees,
    // underwater lots excluded. This is the "titres cessibles" figure.
    const maxCessible = computeProceeds(holder, batches, prices, 1).totalTitlesOffered;
    if (proceeds.isRange) isRange = true;
    totalTitles += proceeds.totalTitlesOffered;
    totalMin += proceeds.totalProceedsMin;
    totalMax += proceeds.totalProceedsMax;

    rows.push({
      holderId: holder.id,
      name: `${holder.first_name ?? ""} ${holder.last_name ?? ""}`.trim() || holder.email,
      email: holder.email,
      type: holder.holder_type,
      employeeStatus: holder.employee_status,
      isFounder: holder.is_founder,
      needsReview: holder.needs_review,
      hasLoginEmail: holder.has_login_email,
      accessToken: holder.access_token,
      requestStatus: data.requestByHolder.get(holder.id) ?? null,
      totalWarrants,
      ordinaryShares: holder.ordinary_shares,
      maxCessible,
      responseLabel,
      hasResponse: !!response,
      titlesOffered: proceeds.totalTitlesOffered,
      proceedsMin: proceeds.totalProceedsMin,
      proceedsMax: proceeds.totalProceedsMax,
      submittedAt: response?.submitted_at ?? null,
      lastModifiedAt: response?.last_modified_at ?? null,
      hasOverride: !!override,
    });
  }

  // Histogram (current employees who responded).
  const buckets = histogramBuckets();
  const histogram = buckets.map((b) => ({
    label: b.label,
    count: curPcts.filter((p) => b.test(p)).length,
  }));

  // Cumulative timeseries.
  const sortedDates = [...dateCounts.keys()].sort();
  let cum = 0;
  const timeseries = sortedDates.map((date) => {
    cum += dateCounts.get(date)!;
    return { date, cumulative: cum };
  });

  const holders = data.holders.length;
  const avgPctCurrent =
    curPcts.length > 0 ? curPcts.reduce((s, p) => s + p, 0) / curPcts.length : null;

  return {
    isRange,
    totals: {
      holders,
      respondents,
      rate: holders ? Math.round((respondents / holders) * 100) : 0,
    },
    byType: {
      current: {
        holders: curHolders,
        respondents: curResp,
        rate: curHolders ? Math.round((curResp / curHolders) * 100) : 0,
      },
      ex: {
        holders: exHolders,
        respondents: exResp,
        rate: exHolders ? Math.round((exResp / exHolders) * 100) : 0,
      },
    },
    totalTitlesForSale: totalTitles,
    totalProceedsMin: totalMin,
    totalProceedsMax: totalMax,
    avgPctCurrent,
    histogram,
    exPie,
    timeseries,
    rows,
  };
}
