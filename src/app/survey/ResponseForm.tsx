"use client";

import { useMemo, useState, useTransition } from "react";
import {
  computeProceeds,
  bandForBatch,
  bandForOrdinaryShares,
  exercisedBelowStrike,
  type ResolvedPrices,
  type HoldingsSummary,
} from "@/lib/pricing";
import {
  t,
  fmtEur2,
  fmtEurRange,
  fmtNum,
  fmtPct,
  fmtPriceBand,
  type Lang,
} from "@/lib/i18n";
import { submitResponse, requestModification, type SubmitResult } from "./actions";
import type { Batch, ModificationStatus } from "@/lib/types";

export interface ResponseFormProps {
  lang: Lang;
  firstName: string;
  isEx: boolean;
  useBinary: boolean;
  sliderMin: number;
  sliderMax: number;
  rangeMin: number;
  rangeMax: number;
  holdings: HoldingsSummary;
  holderType: "current_employee" | "ex_employee";
  ordinaryShares: number;
  batches: Batch[];
  prices: ResolvedPrices;
  headline: { min: number; max: number };
  deadlineLabel: string | null;
  supportEmail: string;
  editable: boolean;
  unlocked: boolean;
  requestStatus: ModificationStatus | null;
  existing: {
    response_mode: "percentage" | "binary";
    percentage_to_sell: number | null;
    accepts_full_sale: boolean | null;
    last_modified_at: string;
  } | null;
}

export default function ResponseForm(props: ResponseFormProps) {
  const {
    lang, firstName, isEx, useBinary, sliderMin, sliderMax, rangeMin, rangeMax,
    holdings, holderType, ordinaryShares, batches, prices, headline,
    supportEmail, editable, unlocked, requestStatus, existing,
  } = props;

  const tr = t(lang);
  // Locale-bound formatters.
  const N = (v: number) => fmtNum(v, lang);
  const E2 = (v: number) => fmtEur2(v, lang);
  const P = (v: number) => fmtPct(v, lang);
  const ER = (a: number, b: number) => fmtEurRange(a, b, lang);
  const band = fmtPriceBand(headline.min, headline.max, lang);

  // Lot label: German uses "ESOP" terminology, so we relabel the instrument word
  // (BSPCE/Options) accordingly while keeping the year/suffix; empty → generic.
  const lotName = (name: string | null | undefined): string => {
    if (!name) return lang === "de" ? "ESOP" : "BSPCE";
    return lang === "de" ? name.replace(/bspce|otpions|options/gi, "ESOP") : name;
  };

  // Only vested lots are sellable (non-vested is forfeited for ex-employees and
  // not offered to current employees), so the letter lists vested lots only.
  const activeBatches = useMemo(
    () => batches.filter((b) => b.status === "active" && b.is_vested),
    [batches],
  );
  // Sellable ordinary shares = exercised shares from grants priced below the
  // buyback (no-loss). Matches computeProceeds, so the listing and the total agree.
  const sellableOrdinary = useMemo(
    () => exercisedBelowStrike(batches, bandForOrdinaryShares(holderType, prices).max),
    [batches, holderType, prices],
  );

  const canEdit = editable && (!existing || unlocked);
  const initialPct = Math.min(Math.max(existing?.percentage_to_sell ?? sliderMin, sliderMin), Math.max(sliderMin, sliderMax));
  const [pct, setPct] = useState<number>(initialPct);
  const [interested, setInterested] = useState<boolean | null>(
    existing ? (existing.percentage_to_sell ?? 0) > 0 : null,
  );
  const [accepts, setAccepts] = useState<boolean | null>(existing?.accepts_full_sale ?? null);
  const canSellAny = sliderMax > 0;
  const [phase, setPhase] = useState<"view" | "edit">(canEdit ? "edit" : "view");
  const [reqStatus, setReqStatus] = useState<ModificationStatus | null>(requestStatus);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onRequest() {
    setResult(null);
    startTransition(async () => {
      const res = await requestModification();
      setResult(res);
      if (res.ok) setReqStatus("pending");
    });
  }

  const fraction = useBinary ? 1 : interested === false ? 0 : pct / 100;
  const proceeds = useMemo(
    () => computeProceeds({ holder_type: holderType, ordinary_shares: ordinaryShares }, batches, prices, fraction),
    [holderType, ordinaryShares, batches, prices, fraction],
  );

  const soldRows = useMemo(() => {
    const m = new Map<string, { name: string; offered: number; min: number; max: number }>();
    for (const b of proceeds.batches) {
      if (b.offeredQuantity <= 0) continue;
      const key = `${b.batch.batch_name ?? ""}__${b.batch.strike_price}__${b.batch.attribution_date ?? ""}`;
      const g = m.get(key) ?? {
        name: b.batch.batch_name ? lotName(b.batch.batch_name) : tr.holdings.exercise(fmtEur2(b.batch.strike_price, lang)),
        offered: 0, min: 0, max: 0,
      };
      g.offered += b.offeredQuantity;
      g.min += b.proceedsMin;
      g.max += b.proceedsMax;
      m.set(key, g);
    }
    return [...m.values()];
  }, [proceeds, tr, lang]);

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await submitResponse(
        useBinary ? { accepts: accepts ?? undefined } : { percentage: interested === false ? 0 : pct },
      );
      setResult(res);
      if (res.ok) {
        setSubmitted(true);
        setReqStatus(null);
        setPhase("view");
      }
    });
  }

  // ---- Letter (legally-validated wording; total updates live) -------------
  const Letter = (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-[15px] leading-relaxed text-slate-800 shadow-sm">
      <p>{tr.survey.hello(firstName)},</p>

      {isEx ? (
        lang === "de" ? (
          <>
            <p>wir prüfen derzeit eine mögliche Finanzierungsrunde, die voraussichtlich bis Ende 2026 abgeschlossen werden könnte. In diesem Zusammenhang und vorbehaltlich des Zustandekommens dieser Transaktion erwägen wir, ehemaligen Mitarbeitern die Möglichkeit zu bieten, ihre Anteile und ESOPs zu veräußern.</p>
            <p>Rein indikativ liegt der für ehemalige Mitarbeiter vorgesehene Preis bei ca. <strong>{band}</strong>. Bitte beachte, dass dieser Preis noch Änderungen unterliegen kann.</p>
            <p className="font-medium">
              Zur Teilnahme wäre eine Veräußerung von 100 % deiner Anteile und
              {holdings.hasUnderwater ? " veräußerbaren ESOPs erforderlich (siehe unten)." : " ESOPs erforderlich."}
            </p>
            <p>Wir würden dein Interesse gerne auf unverbindlicher Basis erfassen. Deine Rückmeldung ist nicht bindend, es wurde noch keine endgültige Entscheidung getroffen, und wir werden uns mit den formalen Details bei dir melden, sobald die Transaktion bestätigt ist.</p>
          </>
        ) : (
          <>
            <p>Nous explorons une potentielle levée de fonds qui pourrait se concrétiser d&apos;ici fin 2026. Dans ce contexte, et sous réserve que cette opération aboutisse, nous envisageons d&apos;offrir aux anciens employés la possibilité de céder leurs actions et BSPCEs.</p>
            <p>À titre purement indicatif, le prix envisagé pour les anciens employés serait d&apos;environ <strong>{band}</strong>. Notez que ce prix est susceptible d&apos;évoluer.</p>
            <p className="font-medium">
              Pour participer, vous devriez céder 100% de vos actions et BSPCEs
              {holdings.hasUnderwater ? " cédables (voir plus bas)" : ""}.
            </p>
            <p>Nous souhaiterions recueillir votre intérêt de manière non contraignante. Votre réponse n&apos;engage à rien — aucune décision définitive n&apos;a été prise à ce stade, et nous vous recontacterons avec les détails formels si l&apos;opération se confirme.</p>
          </>
        )
      ) : lang === "de" ? (
        <>
          <p>wir prüfen derzeit eine mögliche Finanzierungsrunde, die voraussichtlich bis Ende 2026 abgeschlossen werden könnte. In diesem Zusammenhang und vorbehaltlich des Zustandekommens dieser Transaktion erwägen wir, aktuellen Mitarbeitern die Möglichkeit zu bieten, einen Teil deiner ESOPs zu veräußern.</p>
          <p>Rein indikativ liegt der für aktuelle Mitarbeiter vorgesehene Preis bei ca. <strong>{band}</strong>. Dieser Preis kann noch Änderungen unterliegen.</p>
          <p>Du kannst dein Interesse bekunden, zwischen <strong>{rangeMin} %</strong> und <strong>{rangeMax} %</strong> deiner gesamten ESOPs (gevestet und ungevestet) zu veräußern, begrenzt auf deine zum aktuellen Zeitpunkt bereits gevesteten ESOPs. Die genaue Anzahl der veräußerbaren Anteile wird automatisch anhand dieser beiden Obergrenzen berechnet.</p>
          <p>Falls du sie lieber behalten möchtest: die Gründer sind fest davon überzeugt, dass der Preis künftig deutlich steigen wird (es gibt jedoch keine Garantie).</p>
          <p>Wir würden dein Interesse gerne auf unverbindlicher Basis erfassen. Deine Rückmeldung ist nicht bindend, es wurde noch keine endgültige Entscheidung getroffen, und wir werden uns mit den formalen Details bei dir melden, sobald die Transaktion bestätigt ist.</p>
        </>
      ) : (
        <>
          <p>Nous explorons une potentielle levée de fonds qui pourrait se concrétiser d&apos;ici fin 2026. Dans ce contexte, et sous réserve que cette opération aboutisse, nous envisageons d&apos;offrir aux employés actuels la possibilité de céder une partie de leurs BSPCEs.</p>
          <p>À titre purement indicatif, le prix envisagé pour les employés actuels serait d&apos;environ <strong>{band}</strong>. Ce prix est susceptible d&apos;évoluer.</p>
          <p>Vous pouvez indiquer votre intérêt pour céder entre <strong>{rangeMin}%</strong> et <strong>{rangeMax}%</strong> de l&apos;ensemble de vos BSPCEs (vesties et non vesties), dans la limite de vos BSPCEs acquises (vesties) à date. Le nombre exact de titres cessibles sera calculé automatiquement en fonction de ces deux plafonds.</p>
          <p>Si vous préférez les garder, les fondateurs sont fermement convaincus que le prix augmentera sensiblement à l&apos;avenir (pourtant il n&apos;y a aucune garantie).</p>
          <p>Nous souhaiterions recueillir votre intérêt de manière non contraignante. Votre réponse n&apos;engage à rien — aucune décision définitive n&apos;a été prise à ce stade, et nous vous recontacterons avec les détails formels si l&apos;opération se confirme.</p>
        </>
      )}

      {isEx ? (
        <>
          <div>
            <p className="font-medium">{tr.holdings.heldIntro}</p>
            <ul className="mt-2 space-y-1">
              <li>
                <span className="font-medium">A.</span> {tr.holdings.ordinary(N(sellableOrdinary))}
              </li>
              {activeBatches.map((b, i) => {
                const bnd = bandForBatch(holderType, b.is_vested, prices);
                const sellable = b.strike_price < bnd.max;
                const netMin = Math.max(bnd.min - b.strike_price, 0);
                const netMax = Math.max(bnd.max - b.strike_price, 0);
                const net = netMin !== netMax ? `${E2(netMin)} – ${E2(netMax)}` : E2(netMin);
                const lot = lotName(b.batch_name);
                const nv = !b.is_vested ? (lang === "de" ? " (ungevestet)" : " (non vesté)") : "";
                const atStrike =
                  lang === "de"
                    ? `zum Ausübungspreis von ${E2(b.strike_price)}`
                    : `au prix d'exercice de ${E2(b.strike_price)}`;
                return (
                  <li key={b.id} className={sellable ? "" : "text-matera-muted"}>
                    <span className="font-medium">{String.fromCharCode(66 + i)}.</span> {N(b.quantity)}{" "}
                    <strong>{lot}</strong>
                    {nv} {atStrike}{" "}
                    {sellable ? (
                      <>({tr.holdings.netGain} : {net})</>
                    ) : (
                      <span className="italic">— {tr.holdings.notSellable}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {holdings.hasUnderwater && (
              <p className="mt-2 text-xs text-amber-700">{tr.holdings.underwaterNote}</p>
            )}
          </div>
          <p>
            {lang === "de" ? (
              <>Zum indikativen Preis von <strong>{band}</strong> läge der Bruttoerlös vor Steuern bei etwa <strong>{ER(proceeds.totalProceedsMin, proceeds.totalProceedsMax)}</strong>.</>
            ) : (
              <>Au prix indicatif de <strong>{band}</strong>, le produit total avant impôts serait d&apos;environ <strong>{ER(proceeds.totalProceedsMin, proceeds.totalProceedsMax)}</strong>.</>
            )}
          </p>
        </>
      ) : (
        <div>
          <p className="font-medium">{tr.holdings.perTranche}</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-matera-muted">
                  <th className="px-3 py-1.5 font-medium">{tr.holdings.tranche}</th>
                  <th className="px-3 py-1.5 text-right font-medium">{tr.holdings.total}</th>
                  <th className="px-3 py-1.5 text-right font-medium">{tr.holdings.vested}</th>
                  <th className="px-3 py-1.5 text-right font-medium">{tr.holdings.pctVested}</th>
                </tr>
              </thead>
              <tbody>
                {holdings.tranches.map((tt, i) => (
                  <tr key={i} className={`border-b border-slate-100 last:border-0 ${tt.sellable ? "" : "text-matera-muted"}`}>
                    <td className="px-3 py-1.5">
                      <strong className="font-semibold">{lotName(tt.name)}</strong>{" "}
                      <span className="text-xs text-matera-muted">({tr.holdings.exercise(E2(tt.strike))})</span>
                      {!tt.sellable && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          {tr.holdings.nonSellableBadge}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">{N(tt.total)}</td>
                    <td className="px-3 py-1.5 text-right">{N(tt.vested)}</td>
                    <td className="px-3 py-1.5 text-right">{P(tt.pctVested)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-matera-ink">
                  <td className="px-3 py-1.5">{tr.holdings.total}</td>
                  <td className="px-3 py-1.5 text-right">{N(holdings.totalBspce)}</td>
                  <td className="px-3 py-1.5 text-right">{N(holdings.totalVested)}</td>
                  <td className="px-3 py-1.5 text-right">{P(holdings.pctVested)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {holdings.hasUnderwater && (
            <p className="mt-2 text-xs text-amber-700">{tr.holdings.underwaterNote}</p>
          )}
        </div>
      )}
    </article>
  );

  const PerBatchTable = (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-matera-muted">
            <th className="px-4 py-2 font-medium">{tr.widget.lot}</th>
            <th className="px-4 py-2 text-right font-medium">{tr.widget.qtyCeded}</th>
            <th className="px-4 py-2 text-right font-medium">{tr.widget.proceeds}</th>
          </tr>
        </thead>
        <tbody>
          {soldRows.map((b, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2">{b.name}</td>
              <td className="px-4 py-2 text-right">{N(b.offered)}</td>
              <td className="px-4 py-2 text-right">{ER(b.min, b.max)}</td>
            </tr>
          ))}
          {proceeds.ordinary.quantity > 0 && (
            <tr className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2">{tr.widget.ordinaryShares}</td>
              <td className="px-4 py-2 text-right">{N(proceeds.ordinary.quantity)}</td>
              <td className="px-4 py-2 text-right">{ER(proceeds.ordinary.proceedsMin, proceeds.ordinary.proceedsMax)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-matera-ink">
            <td className="px-4 py-2">{tr.widget.total}</td>
            <td className="px-4 py-2 text-right">{N(proceeds.totalTitlesOffered)}</td>
            <td className="px-4 py-2 text-right">{ER(proceeds.totalProceedsMin, proceeds.totalProceedsMax)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const PercentageWidget = (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-matera-ink">{tr.widget.interest}</legend>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="radio" name="interested" checked={interested === true} disabled={!canSellAny}
            onChange={() => setInterested(true)} className="mt-0.5 h-4 w-4 text-matera-primary" />
          <span>
            {tr.widget.yesPartial}
            {!canSellAny && <span className="block text-xs text-matera-muted">{tr.widget.unavailable}</span>}
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="radio" name="interested" checked={interested === false}
            onChange={() => setInterested(false)} className="mt-0.5 h-4 w-4 text-matera-primary" />
          <span>{tr.widget.noSell}</span>
        </label>
      </fieldset>

      {interested === true && canSellAny && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-matera-ink">{tr.widget.pctQuestion}</label>
          <div className="flex items-center gap-4">
            <input type="range" min={sliderMin} max={sliderMax} step={1} value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-matera-primary" />
            <span className="w-14 text-right text-lg font-semibold text-matera-ink">{pct} %</span>
          </div>
          <p className="text-xs text-matera-muted">{tr.widget.soit(N(proceeds.totalTitlesOffered))}</p>
          {PerBatchTable}
        </div>
      )}

      <button onClick={onSubmit} disabled={pending || interested === null}
        className="w-full rounded-lg bg-matera-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {pending ? tr.widget.sending : tr.widget.submitInterest}
      </button>
    </div>
  );

  const BinaryWidget = (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-matera-ink">{tr.widget.yourAnswer}</legend>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="radio" name="accepts" checked={accepts === true}
            onChange={() => setAccepts(true)} className="mt-0.5 h-4 w-4 text-matera-primary" />
          <span>{holdings.hasUnderwater ? tr.widget.yesFullSellable : tr.widget.yesFull}</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="radio" name="accepts" checked={accepts === false}
            onChange={() => setAccepts(false)} className="mt-0.5 h-4 w-4 text-matera-primary" />
          <span>{tr.widget.no}</span>
        </label>
      </fieldset>
      <button onClick={onSubmit} disabled={pending || accepts === null}
        className="w-full rounded-lg bg-matera-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {pending ? tr.widget.sending : tr.widget.submitAnswer}
      </button>
    </div>
  );

  const recapPct = existing ? (existing.percentage_to_sell ?? 0) > 0 : interested;
  const recapPctValue = existing?.percentage_to_sell ?? pct;
  const Recap = (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
      <h2 className="text-sm font-semibold text-emerald-900">
        {result?.ok ? tr.recap.saved : tr.recap.yourAnswer}
      </h2>
      <p className="text-sm text-slate-700">
        {useBinary ? (
          (existing?.accepts_full_sale ?? accepts) ? tr.recap.binYes : tr.recap.binNo
        ) : recapPct ? (
          lang === "de" ? (
            <>Du hast angegeben, <strong>{recapPctValue} %</strong> deiner gesamten ESOPs veräußern zu wollen, also etwa <strong>{N(proceeds.totalTitlesOffered)}</strong> Anteile für einen indikativen Erlös von etwa <strong>{ER(proceeds.totalProceedsMin, proceeds.totalProceedsMax)}</strong>.</>
          ) : (
            <>Vous avez indiqué vouloir céder <strong>{recapPctValue} %</strong> de l&apos;ensemble de vos BSPCEs, soit environ <strong>{N(proceeds.totalTitlesOffered)}</strong> titres pour un produit indicatif d&apos;environ <strong>{ER(proceeds.totalProceedsMin, proceeds.totalProceedsMax)}</strong>.</>
          )
        ) : (
          tr.recap.declined
        )}
      </p>
      {editable && (
        <div className="border-t border-emerald-200/70 pt-3">
          {reqStatus === "pending" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{tr.recap.requestPending}</p>
          ) : (
            <>
              <p className="text-xs text-matera-muted">{tr.recap.locked}</p>
              {reqStatus === "rejected" && (
                <p className="mt-1 text-xs text-red-600">{tr.recap.requestRejectedNote}</p>
              )}
              <button onClick={onRequest} disabled={pending}
                className="mt-2 rounded-lg border border-matera-primary px-4 py-2 text-sm font-medium text-matera-primary hover:bg-blue-50 disabled:opacity-60">
                {pending ? tr.recap.requesting : tr.recap.requestBtn}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  const Disclaimer = (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {tr.survey.discrepancyNote(supportEmail)}
    </p>
  );

  if (!editable) {
    return (
      <div className="space-y-6">
        {Letter}
        {Disclaimer}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-6 text-sm text-slate-700">
          <p className="font-medium text-matera-ink">{tr.survey.closed}</p>
          {existing ? (
            <div className="mt-2">{Recap}</div>
          ) : (
            <p className="mt-1">{tr.survey.notSubmitted(supportEmail)}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Letter}
      {Disclaimer}
      {result && !result.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</p>
      )}
      {result?.testMode && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{tr.recap.testNotSaved}</p>
      )}
      {phase === "view" && (existing || submitted) ? Recap : useBinary ? BinaryWidget : PercentageWidget}
    </div>
  );
}
