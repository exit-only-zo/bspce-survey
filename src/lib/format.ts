// French-locale display formatting helpers.

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eur2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("fr-FR");

export function fmtEur(value: number): string {
  return eur.format(value);
}

export function fmtEur2(value: number): string {
  return eur2.format(value);
}

export function fmtNum(value: number): string {
  return num.format(value);
}

// Percentage with at most one decimal: "42 %" / "42,5 %".
export function fmtPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(rounded)} %`;
}

// "€X" or "€X – €Y" depending on whether min/max differ.
export function fmtEurRange(min: number, max: number, decimals = false): string {
  const f = decimals ? fmtEur2 : fmtEur;
  return min === max ? f(min) : `${f(min)} – ${f(max)}`;
}

// "€X par titre" or "€X–Y par titre".
export function fmtPriceBand(min: number, max: number): string {
  if (min === max) return `${eur2.format(min)} par titre`;
  return `${eur2.format(min)}–${eur2.format(max)} par titre`;
}

// Parse a date-ish setting string for display (returns null if unset/invalid).
export function fmtDateFr(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
