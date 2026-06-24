// ===========================================================================
// Pricing & proceeds computation — the financial core.
// ===========================================================================
// Pure functions, no I/O. Used identically by the holder /survey page and by
// the admin dashboards so the numbers always agree. Money kept as numbers;
// callers format for display.
//
// Per-batch pricing rule (CRITICAL — see spec):
//   current_employee                  -> price_current
//   ex_employee  AND  is_vested       -> price_ex_vested
//   ex_employee  AND  NOT is_vested   -> price_ex_unvested
//   holder_overrides custom price for that category overrides silently.
// Ordinary shares have no strike: net gain per title = full price.
// A "_max" price turns a category into a RANGE (display "€X–Y").
// ===========================================================================

import type { Batch, Holder, HolderOverride, Settings } from "@/lib/types";
import { settingBool, settingNum } from "@/lib/settings-utils";

export interface PriceBand {
  // Per-title indicative sale price. min === max when not a range.
  min: number;
  max: number;
}

export interface ResolvedPrices {
  current: PriceBand;
  exVested: PriceBand;
  exUnvested: PriceBand;
}

// Resolve the three category price bands from settings + optional overrides.
export function resolvePrices(
  settings: Settings,
  override?: HolderOverride | null,
): ResolvedPrices {
  const band = (
    base: number | null,
    maxVal: number | null,
    custom: number | null | undefined,
  ): PriceBand => {
    // An override collapses the band to a single point (no range when custom).
    if (custom !== null && custom !== undefined) {
      return { min: custom, max: custom };
    }
    const min = base ?? 0;
    const max = maxVal ?? min;
    return { min, max: Math.max(min, max) };
  };

  return {
    current: band(
      settingNum(settings.sale_price_current_employees),
      settingNum(settings.sale_price_current_employees_max),
      override?.custom_price_current ?? null,
    ),
    exVested: band(
      settingNum(settings.sale_price_ex_employees_vested),
      settingNum(settings.sale_price_ex_employees_vested_max),
      override?.custom_price_ex_vested ?? null,
    ),
    exUnvested: band(
      settingNum(settings.sale_price_ex_employees_unvested),
      settingNum(settings.sale_price_ex_employees_unvested_max),
      override?.custom_price_ex_unvested ?? null,
    ),
  };
}

// Pick the price band that applies to a specific batch given the holder type.
export function bandForBatch(
  holderType: Holder["holder_type"],
  isVested: boolean,
  prices: ResolvedPrices,
): PriceBand {
  if (holderType === "current_employee") return prices.current;
  return isVested ? prices.exVested : prices.exUnvested;
}

// The single band used for ordinary shares (priced like the holder's category;
// ordinary shares are already-exercised, so they use the "vested" band for
// ex-employees and the current band for current employees).
export function bandForOrdinaryShares(
  holderType: Holder["holder_type"],
  prices: ResolvedPrices,
): PriceBand {
  return holderType === "current_employee" ? prices.current : prices.exVested;
}

export interface BatchProceeds {
  batch: Batch;
  band: PriceBand;
  // Net gain PER TITLE = max(price - strike, 0). Clamped: a strike above the
  // sale price yields €0, never negative.
  netPerTitleMin: number;
  netPerTitleMax: number;
  // Quantity actually offered = quantity * fraction (fraction in [0,1]).
  offeredQuantity: number;
  // Proceeds = netPerTitle * offeredQuantity.
  proceedsMin: number;
  proceedsMax: number;
}

export interface ProceedsResult {
  isRange: boolean;
  batches: BatchProceeds[];
  ordinary: {
    quantity: number; // ordinary shares offered
    band: PriceBand;
    proceedsMin: number;
    proceedsMax: number;
  };
  totalProceedsMin: number;
  totalProceedsMax: number;
  // Total titles indicated for sale (batches offered + ordinary offered).
  totalTitlesOffered: number;
}

function netPerTitle(price: number, strike: number): number {
  return Math.max(price - strike, 0);
}

// Compute full proceeds for a holder at a given sale fraction (0..1).
//
// The fraction is a percentage of the holder's % BASE; we then fill that quota
// from the eligible (sellable) pool, OLDEST FIRST (already-exercised ordinary
// shares, then BSPCE batches by attribution date). Older grants usually carry a
// lower strike (higher net) and a longer holding period (better tax).
//
//   - current_employee : the % is of ALL BSPCEs (vested + non-vested), but only
//     VESTED batches are sold; the quota is capped at the vested total, so a
//     holder can never indicate more than what is acquired. Ordinary shares are
//     not part of the current-employee offer.
//   - ex_employee      : sells ordinary shares + VESTED BSPCE only. Non-vested
//     BSPCE are forfeited on departure (long-standing rule), so they are never
//     eligible. Vested and ordinary are priced apart.
//
// voided and non-vested-for-ex batches are always excluded from the sale.
export function computeProceeds(
  holder: Pick<Holder, "holder_type" | "ordinary_shares">,
  batches: Batch[],
  prices: ResolvedPrices,
  fraction: number,
): ProceedsResult {
  const f = Math.min(Math.max(fraction, 0), 1);
  const isCurrent = holder.holder_type === "current_employee";
  const active = batches.filter((b) => b.status === "active");

  // No selling at a loss: a batch is excluded entirely when its strike is at or
  // above the best indicative price (net would be ≤ 0 even in the best case).
  const sellable = active.filter(
    (b) => isSellableBatch(b, holder.holder_type, prices),
  );

  // Eligible pool (what can actually be sold) vs the % base (denominator).
  // Only VESTED BSPCE are ever sold — for ex-employees non-vested is forfeited
  // on departure, for current employees only acquired (vested) lots are offered.
  const sellableVested = sellable.filter((b) => b.is_vested);
  const pool = sellableVested;
  const includeOrdinary = !isCurrent;

  // Ordinary (already-exercised) shares sell at the full price — but the no-loss
  // rule applies to them too: a share exercised at a strike >= the buyback price
  // would sell at a loss (the holder already paid more than the buyback), so we
  // count only exercised shares whose grant strike is below that price.
  const ordBand = bandForOrdinaryShares(holder.holder_type, prices);
  const sellableOrdinary = includeOrdinary ? exercisedBelowStrike(batches, ordBand.max) : 0;

  const base = isCurrent
    ? sellable.reduce((s, b) => s + b.quantity, 0) // current: % base = vested + non-vested
    : sellableOrdinary + sellableVested.reduce((s, b) => s + b.quantity, 0); // ex: ordinary + vested
  const poolTotal = sellableOrdinary + pool.reduce((s, b) => s + b.quantity, 0);

  // Quota of titles to sell, capped at what is actually eligible.
  let remaining = Math.min(Math.round(f * base), poolTotal);

  let isRange = false;
  let totalMin = 0;
  let totalMax = 0;
  let totalTitles = 0;

  // 1) Ordinary shares first (already exercised; net = full price). Only part of
  //    the offer for ex-employees, and only the loss-free ones (see above).
  if (ordBand.max !== ordBand.min) isRange = true;
  const ordEligible = sellableOrdinary;
  const ordOffered = Math.min(remaining, ordEligible);
  remaining -= ordOffered;
  const ordMin = ordBand.min * ordOffered;
  const ordMax = ordBand.max * ordOffered;
  totalMin += ordMin;
  totalMax += ordMax;
  totalTitles += ordOffered;

  // 2) BSPCE batches from the eligible pool, oldest attribution date first.
  const ordered = [...pool].sort((a, b) => {
    const da = a.attribution_date ?? "9999-12-31";
    const db = b.attribution_date ?? "9999-12-31";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const batchResults: BatchProceeds[] = ordered.map((b) => {
    const band = bandForBatch(holder.holder_type, b.is_vested, prices);
    if (band.max !== band.min) isRange = true;

    const netMin = netPerTitle(band.min, b.strike_price);
    const netMax = netPerTitle(band.max, b.strike_price);
    const offered = Math.min(remaining, b.quantity);
    remaining -= offered;
    const pMin = netMin * offered;
    const pMax = netMax * offered;

    totalMin += pMin;
    totalMax += pMax;
    totalTitles += offered;

    return {
      batch: b,
      band,
      netPerTitleMin: netMin,
      netPerTitleMax: netMax,
      offeredQuantity: offered,
      proceedsMin: pMin,
      proceedsMax: pMax,
    };
  });

  return {
    isRange,
    batches: batchResults,
    ordinary: {
      quantity: ordOffered,
      band: ordBand,
      proceedsMin: ordMin,
      proceedsMax: ordMax,
    },
    totalProceedsMin: totalMin,
    totalProceedsMax: totalMax,
    totalTitlesOffered: totalTitles,
  };
}

// Resolve the max sellable percentage for a holder (cap), considering overrides.
export function maxPctForHolder(
  holderType: Holder["holder_type"],
  settings: Settings,
  override?: HolderOverride | null,
): number {
  if (override?.custom_max_pct !== null && override?.custom_max_pct !== undefined) {
    return override.custom_max_pct;
  }
  if (holderType === "current_employee") {
    return settingNum(settings.max_pct_current_employees) ?? 50;
  }
  return settingNum(settings.max_pct_ex_employees) ?? 100;
}

// The lower bound of the current-employee % range (the consultation floor).
export function minPctCurrent(settings: Settings): number {
  return settingNum(settings.min_pct_current_employees) ?? 20;
}

// No selling at a loss: a batch is sellable only if its strike is strictly below
// the best indicative price for its category (otherwise net is ≤ 0).
export function isSellableBatch(
  b: Batch,
  holderType: Holder["holder_type"],
  prices: ResolvedPrices,
): boolean {
  if (b.status !== "active") return false;
  return b.strike_price < bandForBatch(holderType, b.is_vested, prices).max;
}

// Total already-exercised (now ordinary) shares whose grant strike is strictly
// below `maxPrice`. Shares exercised at a higher strike would sell at a loss and
// are excluded (no-loss rule on ordinary shares). Deduped per grant because the
// vested/non-vested sub-batches of one grant carry the same `meta.exercised`.
export function exercisedBelowStrike(batches: Batch[], maxPrice: number): number {
  const seen = new Set<string>();
  let total = 0;
  for (const b of batches) {
    const ex = b.meta && typeof b.meta.exercised === "number" ? (b.meta.exercised as number) : 0;
    if (ex <= 0) continue;
    const key = `${b.batch_name ?? ""}__${b.strike_price}__${b.attribution_date ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (b.strike_price < maxPrice) total += ex;
  }
  return total;
}

// Share of a holder's SELLABLE BSPCEs that is vested (0..100). Underwater lots
// (strike ≥ price) are excluded since they cannot be sold.
export function vestedPctOfTotal(
  batches: Batch[],
  holderType: Holder["holder_type"],
  prices: ResolvedPrices,
): number {
  const sellable = batches.filter((b) => isSellableBatch(b, holderType, prices));
  const total = sellable.reduce((s, b) => s + b.quantity, 0);
  if (total === 0) return 0;
  const vested = sellable.filter((b) => b.is_vested).reduce((s, b) => s + b.quantity, 0);
  return (vested / total) * 100;
}

// Effective slider bounds for a current employee: the configured [min, max]
// range, with the max clamped to the % actually vested & sellable.
export function currentEmployeeSliderBounds(
  settings: Settings,
  batches: Batch[],
  prices: ResolvedPrices,
  override?: HolderOverride | null,
): { min: number; max: number } {
  const maxSetting = maxPctForHolder("current_employee", settings, override);
  const minSetting = minPctCurrent(settings);
  const vestedCap = Math.floor(vestedPctOfTotal(batches, "current_employee", prices));
  const max = Math.max(0, Math.min(maxSetting, vestedCap));
  const min = Math.min(minSetting, max);
  return { min: Math.max(0, min), max };
}

export interface TrancheHolding {
  name: string;
  strike: number;
  total: number;
  vested: number;
  nonVested: number;
  pctVested: number; // 0..100
  sellable: boolean; // false when underwater (strike ≥ price)
}

export interface HoldingsSummary {
  tranches: TrancheHolding[];
  totalBspce: number;
  totalVested: number;
  pctVested: number;
  hasUnderwater: boolean;
}

// Per-tranche (grant) holdings: total / vested / % vested, plus overall totals.
// Recombines the vested + non-vested sub-batches of a grant and flags lots whose
// strike is at/above the indicative price (non-sellable — no loss-making sales).
export function summarizeHoldings(
  batches: Batch[],
  holderType: Holder["holder_type"],
  prices: ResolvedPrices,
): HoldingsSummary {
  const active = batches.filter((b) => b.status === "active");
  const byTranche = new Map<string, TrancheHolding & { _sellMax: number }>();
  for (const b of active) {
    const key = `${b.batch_name ?? ""}__${b.strike_price}__${b.attribution_date ?? ""}`;
    const t =
      byTranche.get(key) ??
      {
        name: b.batch_name || "BSPCE",
        strike: b.strike_price,
        total: 0, vested: 0, nonVested: 0, pctVested: 0, sellable: true,
        _sellMax: bandForBatch(holderType, b.is_vested, prices).max,
      };
    t.total += b.quantity;
    if (b.is_vested) t.vested += b.quantity;
    else t.nonVested += b.quantity;
    t._sellMax = Math.max(t._sellMax, bandForBatch(holderType, b.is_vested, prices).max);
    byTranche.set(key, t);
  }
  const tranches: TrancheHolding[] = [...byTranche.values()].map(({ _sellMax, ...t }) => ({
    ...t,
    pctVested: t.total > 0 ? (t.vested / t.total) * 100 : 0,
    sellable: t.strike < _sellMax,
  }));
  // Display totals cover ALL holdings; underwater lots are flagged per tranche
  // and excluded from the sale by computeProceeds (not from this overview).
  const totalBspce = tranches.reduce((s, t) => s + t.total, 0);
  const totalVested = tranches.reduce((s, t) => s + t.vested, 0);
  return {
    tranches,
    totalBspce,
    totalVested,
    hasUnderwater: tranches.some((t) => !t.sellable),
    pctVested: totalBspce > 0 ? (totalVested / totalBspce) * 100 : 0,
  };
}

// Whether an ex-employee is in all-or-nothing (binary) mode.
export function exEmployeeBinaryMode(settings: Settings): boolean {
  return settingBool(settings.ex_employees_all_or_nothing);
}

// Convenience: the indicative fraction implied by a stored response.
export function fractionFromResponse(args: {
  response_mode: "percentage" | "binary";
  percentage_to_sell: number | null;
  accepts_full_sale: boolean | null;
}): number {
  if (args.response_mode === "binary") {
    return args.accepts_full_sale ? 1 : 0;
  }
  return (args.percentage_to_sell ?? 0) / 100;
}
