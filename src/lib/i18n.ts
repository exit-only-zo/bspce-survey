// ===========================================================================
// Holder-facing internationalisation (FR / DE). Admin stays French.
// ===========================================================================
// Pure & client-safe. Letter wording (legally validated) lives inline in the
// survey components; this module holds UI strings + locale-aware formatters.
// ===========================================================================

export type Lang = "fr" | "de";
export const LANGS: Lang[] = ["fr", "de"];
export const LANG_COOKIE = "lang";

const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "fr-FR");

export function fmtEur(value: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
export function fmtEur2(value: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
export function fmtNum(value: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang)).format(value);
}
export function fmtPct(value: number, lang: Lang): string {
  const r = Math.round(value * 10) / 10;
  return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(r)} %`;
}
export function fmtEurRange(min: number, max: number, lang: Lang, decimals = false): string {
  const f = (v: number) => (decimals ? fmtEur2(v, lang) : fmtEur(v, lang));
  return min === max ? f(min) : `${f(min)} – ${f(max)}`;
}
export function fmtPriceBand(min: number, max: number, lang: Lang): string {
  const unit = lang === "de" ? "pro Anteil" : "par titre";
  const sep = lang === "de" ? " bis " : "–";
  return min === max
    ? `${fmtEur2(min, lang)} ${unit}`
    : `${fmtEur2(min, lang)}${sep}${fmtEur2(max, lang)} ${unit}`;
}
export function fmtDateLong(value: string | null | undefined, lang: Lang): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric" }).format(d);
}

// --- UI strings ------------------------------------------------------------
interface Dict {
  nda: {
    title: string;
    p1: string;
    p2: string;
    p3: string;
    checkbox: string;
    accept: string;
    validating: string;
    footer: string;
  };
  survey: {
    hello: (n: string) => string;
    help: string;
    replyUntil: (d: string) => string;
    dataAsOf: (d: string) => string;
    testBanner: string;
    closed: string;
    notSubmitted: (email: string) => string;
    logout: string;
    resetDemo: string;
    adminPreview: (email: string) => string;
    backAdmin: string;
  };
  footer: string;
  holdings: {
    perTranche: string;
    tranche: string;
    total: string;
    vested: string;
    pctVested: string;
    exercise: (x: string) => string;
    heldIntro: string;
    ordinary: (n: string) => string;
    bspceLine: (q: string, lot: string, nonVested: boolean, strike: string, net: string) => string;
    proceedsLine: string; // around <strong> values, handled in JSX
    netGain: string; // label "gain net par titre indicatif"
    notSellable: string; // inline phrase when a lot is underwater
    nonSellableBadge: string;
    underwaterNote: string;
  };
  widget: {
    interest: string;
    yesPartial: string;
    unavailable: string;
    noSell: string;
    pctQuestion: string;
    soit: (n: string) => string;
    lot: string;
    qtyCeded: string;
    proceeds: string;
    ordinaryShares: string;
    total: string;
    submitInterest: string;
    yourAnswer: string;
    yesFull: string;
    yesFullSellable: string; // when some lots are underwater
    no: string;
    submitAnswer: string;
    sending: string;
  };
  recap: {
    saved: string;
    yourAnswer: string;
    binYes: string;
    binNo: string;
    declined: string;
    locked: string;
    requestPending: string;
    requestRejectedNote: string;
    requestBtn: string;
    requesting: string;
    testNotSaved: string;
  };
  faq: { title: string; back: string; question: string };
  errors: {
    locked: string;
    selectAnswer: string;
    invalidPct: string;
    session: string;
    nda: string;
    closed: string;
    deadline: string;
  };
}

const FR: Dict = {
  nda: {
    title: "Engagement de confidentialité",
    p1: "Les informations qui vous seront présentées dans les pages suivantes — notamment les prix indicatifs, le détail de vos titres et les produits potentiels de cession — sont strictement confidentielles et communiquées dans le cadre d'un processus en cours.",
    p2: "En accédant à ces informations, vous vous engagez à ne pas les divulguer, reproduire ou diffuser, sous quelque forme que ce soit, à des tiers. Votre accès et vos actions font l'objet d'une journalisation à des fins de sécurité.",
    p3: "Les indications recueillies sont non contraignantes et ne constituent ni une offre, ni un engagement de cession ou d'achat.",
    checkbox:
      "J'ai lu et j'accepte cet engagement de confidentialité, et je comprends que les indications sont non contraignantes.",
    accept: "J'accepte",
    validating: "Validation…",
    footer: "Information strictement confidentielle — Matera SAS — Reproduction et diffusion interdites",
  },
  survey: {
    hello: (n) => `Bonjour ${n}`,
    help: "Aide",
    replyUntil: (d) => `Vous pouvez répondre jusqu'au ${d}.`,
    dataAsOf: (d) => `Données à jour au ${d}.`,
    testBanner: "MODE TEST — réponses non enregistrées",
    closed: "Le sondage est clos.",
    notSubmitted: (email) =>
      `Vous n'avez pas soumis de réponse. Contactez ${email} si vous pensez qu'il s'agit d'une erreur.`,
    logout: "Se déconnecter",
    resetDemo: "Se déconnecter (réinitialiser la démo)",
    adminPreview: (email) => `Aperçu admin du sondage de ${email}`,
    backAdmin: "← Retour admin",
  },
  footer: "Information strictement confidentielle — Matera SAS — Reproduction et diffusion interdites",
  holdings: {
    perTranche: "Vos BSPCEs, par tranche :",
    tranche: "Tranche",
    total: "Total",
    vested: "Vesté",
    pctVested: "% vesté",
    exercise: (x) => `exercice ${x}`,
    heldIntro: "Pour information, vous détenez :",
    ordinary: (n) => `${n} action(s) ordinaire(s)`,
    bspceLine: (q, lot, nonVested, strike, net) =>
      `${q} ${lot}${nonVested ? " (non vesté)" : ""} au prix d'exercice de ${strike} (gain net par titre indicatif : ${net})`,
    proceedsLine: "",
    netGain: "gain net par titre indicatif",
    notSellable: "non cédable — prix d'exercice supérieur au prix de rachat indicatif",
    nonSellableBadge: "non cédable",
    underwaterNote:
      "Certains de vos lots ne sont pas cessibles car leur prix d'exercice est supérieur au prix de rachat indicatif. Ils sont exclus de l'offre et du calcul des produits.",
  },
  widget: {
    interest: "Votre intérêt",
    yesPartial: "Oui, je souhaite céder une partie de mes BSPCEs",
    unavailable: "(indisponible : vous n'avez pas encore de BSPCE acquis cessible à ce jour)",
    noSell: "Non, je ne souhaite pas céder de titres pour le moment",
    pctQuestion: "Quel pourcentage de l'ensemble de vos BSPCEs souhaitez-vous céder ?",
    soit: (n) => `Soit ${n} titres (calculé automatiquement, dans la limite de vos BSPCEs acquis).`,
    lot: "Lot",
    qtyCeded: "Quantité cédée",
    proceeds: "Produit indicatif",
    ordinaryShares: "Actions ordinaires",
    total: "Total",
    submitInterest: "Soumettre mon indication d'intérêt (non contraignante)",
    yourAnswer: "Votre réponse",
    yesFull: "Oui, je suis intéressé(e) à céder 100% de mes actions et BSPCEs au prix indicatif",
    yesFullSellable: "Oui, je suis intéressé(e) à céder 100% de mes actions et BSPCEs cédables au prix indicatif",
    no: "Non, je ne suis pas intéressé(e)",
    submitAnswer: "Soumettre ma réponse (non contraignante)",
    sending: "Envoi…",
  },
  recap: {
    saved: "Réponse enregistrée",
    yourAnswer: "Votre réponse",
    binYes: "Vous avez indiqué être intéressé(e) à céder 100% de vos titres.",
    binNo: "Vous avez indiqué ne pas être intéressé(e).",
    declined: "Vous avez indiqué ne pas souhaiter céder de titres pour le moment.",
    locked:
      "Votre réponse est enregistrée et verrouillée. Pour la modifier, envoyez une demande : un administrateur doit l'approuver avant que vous puissiez y revenir.",
    requestPending:
      "Votre demande de modification a été envoyée et est en attente de validation par un administrateur. Vous pourrez modifier votre réponse une fois la demande approuvée.",
    requestRejectedNote: "Votre précédente demande a été refusée. Vous pouvez en envoyer une nouvelle.",
    requestBtn: "Demander une modification",
    requesting: "Envoi…",
    testNotSaved: "MODE TEST — votre réponse n'a pas été enregistrée.",
  },
  faq: { title: "Aide & FAQ", back: "← Retour", question: "Une question ?" },
  errors: {
    locked: "Votre réponse est verrouillée. Demandez une modification à valider par un administrateur.",
    selectAnswer: "Veuillez sélectionner une réponse.",
    invalidPct: "Pourcentage invalide.",
    session: "Session invalide.",
    nda: "Veuillez accepter l'engagement de confidentialité.",
    closed: "Le sondage est clos.",
    deadline: "La date limite est dépassée.",
  },
};

const DE: Dict = {
  nda: {
    title: "Vertraulichkeitsverpflichtung",
    p1: "Die Informationen, die dir auf den folgenden Seiten angezeigt werden — insbesondere die indikativen Preise, die Aufstellung deiner Anteile und die möglichen Veräußerungserlöse — sind streng vertraulich und werden im Rahmen eines laufenden Prozesses mitgeteilt.",
    p2: "Mit dem Zugriff auf diese Informationen verpflichtest du dich, sie in keiner Form an Dritte weiterzugeben, zu vervielfältigen oder zu verbreiten. Dein Zugriff und deine Aktionen werden aus Sicherheitsgründen protokolliert.",
    p3: "Die erhobenen Angaben sind unverbindlich und stellen weder ein Angebot noch eine Verpflichtung zum Verkauf oder Kauf dar.",
    checkbox:
      "Ich habe diese Vertraulichkeitsverpflichtung gelesen und stimme ihr zu, und mir ist bewusst, dass die Angaben unverbindlich sind.",
    accept: "Ich stimme zu",
    validating: "Wird bestätigt…",
    footer: "Streng vertrauliche Information — Matera SAS — Vervielfältigung und Verbreitung untersagt",
  },
  survey: {
    hello: (n) => `Hallo ${n}`,
    help: "Hilfe",
    replyUntil: (d) => `Du kannst bis zum ${d} antworten.`,
    dataAsOf: (d) => `Daten aktualisiert am ${d}.`,
    testBanner: "TESTMODUS — Antworten werden nicht gespeichert",
    closed: "Die Umfrage ist geschlossen.",
    notSubmitted: (email) =>
      `Du hast keine Antwort übermittelt. Kontaktiere ${email}, falls dies ein Fehler sein sollte.`,
    logout: "Abmelden",
    resetDemo: "Abmelden (Demo zurücksetzen)",
    adminPreview: (email) => `Admin-Vorschau der Umfrage von ${email}`,
    backAdmin: "← Zurück zum Admin",
  },
  footer: "Streng vertrauliche Information — Matera SAS — Vervielfältigung und Verbreitung untersagt",
  holdings: {
    perTranche: "Deine ESOPs nach Tranche:",
    tranche: "Tranche",
    total: "Gesamt",
    vested: "Gevestet",
    pctVested: "% gevestet",
    exercise: (x) => `Ausübungspreis ${x}`,
    heldIntro: "Zur Information, du hältst:",
    ordinary: (n) => `${n} Anteil(e)`,
    bspceLine: (q, lot, nonVested, strike, net) =>
      `${q} ${lot}${nonVested ? " (ungevestet)" : ""} zum Ausübungspreis von ${strike} (indikativer Nettoertrag pro Anteil: ${net})`,
    proceedsLine: "",
    netGain: "indikativer Nettoertrag pro Anteil",
    notSellable: "nicht veräußerbar — Ausübungspreis über dem indikativen Rückkaufpreis",
    nonSellableBadge: "nicht veräußerbar",
    underwaterNote:
      "Einige deiner Tranchen sind nicht veräußerbar, da ihr Ausübungspreis über dem indikativen Rückkaufpreis liegt. Sie sind vom Angebot und von der Erlösberechnung ausgeschlossen.",
  },
  widget: {
    interest: "Dein Interesse",
    yesPartial: "Ja, ich möchte einen Teil meiner ESOPs veräußern",
    unavailable: "(nicht verfügbar: du hast zum heutigen Zeitpunkt noch keine veräußerbaren, gevesteten ESOPs)",
    noSell: "Nein, ich möchte derzeit keine Anteile veräußern",
    pctQuestion: "Welchen Prozentsatz deiner gesamten ESOPs möchtest du veräußern?",
    soit: (n) => `Das entspricht ${n} Anteilen (automatisch berechnet, begrenzt auf deine gevesteten ESOPs).`,
    lot: "Tranche",
    qtyCeded: "Veräußerte Menge",
    proceeds: "Indikativer Erlös",
    ordinaryShares: "Anteile",
    total: "Gesamt",
    submitInterest: "Meine unverbindliche Interessensbekundung absenden",
    yourAnswer: "Deine Antwort",
    yesFull: "Ja, ich bin interessiert, 100 % meiner Anteile und ESOPs zum indikativen Preis zu veräußern",
    yesFullSellable: "Ja, ich bin interessiert, 100 % meiner Anteile und veräußerbaren ESOPs zum indikativen Preis zu veräußern",
    no: "Nein, ich bin nicht interessiert",
    submitAnswer: "Meine (unverbindliche) Antwort absenden",
    sending: "Wird gesendet…",
  },
  recap: {
    saved: "Antwort gespeichert",
    yourAnswer: "Deine Antwort",
    binYes: "Du hast angegeben, interessiert zu sein, 100 % deiner Anteile zu veräußern.",
    binNo: "Du hast angegeben, nicht interessiert zu sein.",
    declined: "Du hast angegeben, derzeit keine Anteile veräußern zu wollen.",
    locked:
      "Deine Antwort ist gespeichert und gesperrt. Um sie zu ändern, sende eine Anfrage: ein Administrator muss sie genehmigen, bevor du sie bearbeiten kannst.",
    requestPending:
      "Deine Änderungsanfrage wurde gesendet und wartet auf die Genehmigung durch einen Administrator. Sobald sie genehmigt ist, kannst du deine Antwort ändern.",
    requestRejectedNote: "Deine vorherige Anfrage wurde abgelehnt. Du kannst eine neue senden.",
    requestBtn: "Änderung beantragen",
    requesting: "Wird gesendet…",
    testNotSaved: "TESTMODUS — deine Antwort wurde nicht gespeichert.",
  },
  faq: { title: "Hilfe & FAQ", back: "← Zurück", question: "Eine Frage?" },
  errors: {
    locked: "Deine Antwort ist gesperrt. Beantrage eine vom Administrator zu genehmigende Änderung.",
    selectAnswer: "Bitte wähle eine Antwort.",
    invalidPct: "Ungültiger Prozentsatz.",
    session: "Ungültige Sitzung.",
    nda: "Bitte stimme der Vertraulichkeitsverpflichtung zu.",
    closed: "Die Umfrage ist geschlossen.",
    deadline: "Die Frist ist abgelaufen.",
  },
};

export function t(lang: Lang): Dict {
  return lang === "de" ? DE : FR;
}
