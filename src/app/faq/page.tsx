import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { logAccess } from "@/lib/logging";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ConfidentialFooter, ConfidentialBody } from "@/components/Confidential";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Default FAQ shown when no admin-edited markdown is set yet.
const DEFAULT_FAQ = `## Qu'est-ce qu'un BSPCE ?
Un Bon de Souscription de Parts de Créateur d'Entreprise donne le droit
d'acquérir des actions à un prix fixé (le prix d'exercice).

## Différence entre actions ordinaires et BSPCEs
Les actions ordinaires sont déjà détenues. Les BSPCEs sont des droits à
souscrire des actions à un prix d'exercice donné.

## Que veut dire « non contraignant » ?
Votre indication d'intérêt ne vous engage pas. Aucune cession n'a lieu sur la
seule base de votre réponse.

## Quelle fiscalité s'applique ?
La fiscalité dépend de votre situation. Rapprochez-vous de votre conseil.

## Pourquoi y a-t-il une fourchette de prix ?
Le prix final n'est pas encore arrêté ; une fourchette indicative est donnée.

## À qui m'adresser pour plus d'informations ?
Écrivez-nous à bspce-2026@matera.eu.`;

const DEFAULT_FAQ_DE = `## Was ist ein ESOP?
Ein Bezugsrecht, das dir das Recht gibt, Anteile zu einem festgelegten Preis
(dem Ausübungspreis) zu erwerben.

## Unterschied zwischen Anteilen und ESOPs
Anteile werden bereits gehalten. ESOPs sind Rechte, Anteile zu einem
bestimmten Ausübungspreis zu zeichnen.

## Was bedeutet „unverbindlich"?
Deine Interessensbekundung verpflichtet dich zu nichts. Allein aufgrund deiner
Antwort findet keine Veräußerung statt.

## Welche Besteuerung gilt?
Die Besteuerung hängt von deiner Situation ab. Bitte wende dich an deine Beratung.

## Warum gibt es eine Preisspanne?
Der endgültige Preis steht noch nicht fest; es wird eine indikative Spanne
angegeben.

## An wen wende ich mich für weitere Informationen?
Schreibe uns an bspce-2026@matera.eu.`;

export default async function FaqPage() {
  const { email, isAdmin } = await getSessionContext();
  if (!email) redirect("/login");
  await logAccess(email, "/faq");

  const settings = await getSettings();
  const lang = getLang();
  const tr = t(lang);
  const md = settings.faq_markdown?.trim() || (lang === "de" ? DEFAULT_FAQ_DE : DEFAULT_FAQ);
  const support = settings.support_email ?? "bspce-2026@matera.eu";

  return (
    <div className="relative min-h-screen">
      {!isAdmin && <ConfidentialBody />}
      <main className="relative z-10 mx-auto max-w-2xl px-5 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-matera-ink">{tr.faq.title}</h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher current={lang} />
            <Link href="/survey" className="text-sm text-matera-primary hover:underline">
              {tr.faq.back}
            </Link>
          </div>
        </div>

        {/* Minimal markdown rendering: split on ## headings. A full markdown
            renderer can be added later; kept dependency-free for now. */}
        <div className="mt-6 space-y-5">
          {md.split(/\n(?=## )/).map((block, i) => {
            const lines = block.split("\n");
            const heading = lines[0]?.replace(/^##\s*/, "") ?? "";
            const body = lines.slice(1).join("\n").trim();
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-matera-ink">{heading}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{body}</p>
              </div>
            );
          })}
        </div>

        <a
          href={`mailto:${support}`}
          className="mt-6 inline-block rounded-lg bg-matera-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {tr.faq.question}
        </a>

        <ConfidentialFooter lang={lang} />
      </main>
    </div>
  );
}
