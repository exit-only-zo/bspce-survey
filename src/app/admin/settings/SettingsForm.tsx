"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateSettings, type SettingsState } from "./actions";
import type { Settings } from "@/lib/types";

const initial: SettingsState = { ok: false, message: null, error: null };

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-matera-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-matera-ink">{title}</legend>
      <div className="mt-2 space-y-4">{children}</div>
    </fieldset>
  );
}

function Text({
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
  hint,
}: {
  name: keyof Settings;
  label: string;
  defaultValue: string | null;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-matera-ink">{label}</span>
      {hint && <span className="block text-xs text-matera-muted">{hint}</span>}
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-matera-primary focus:ring-2 focus:ring-matera-primary/20"
      />
    </label>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: keyof Settings;
  label: string;
  defaultChecked: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-matera-primary focus:ring-matera-primary"
      />
      <span>
        <span className="text-sm font-medium text-matera-ink">{label}</span>
        {hint && <span className="block text-xs text-matera-muted">{hint}</span>}
      </span>
    </label>
  );
}

const isTrue = (v: string | null) => v === "true" || v === "1";

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useFormState(updateSettings, initial);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <Section title="Sondage">
        <Toggle name="survey_open" label="Sondage ouvert" defaultChecked={isTrue(settings.survey_open)} />
        <Text
          name="survey_deadline"
          label="Date limite"
          type="datetime-local"
          defaultValue={settings.survey_deadline}
          hint="Laisser vide pour aucune date limite."
        />
        <Text
          name="webinar_info"
          label="Bannière webinaire (texte libre)"
          defaultValue={settings.webinar_info}
          placeholder="Webinaire le 30 juin à 14h…"
        />
      </Section>

      <Section title="Prix indicatifs (€ par titre)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Text name="sale_price_current_employees" label="Employés actuels" type="number" defaultValue={settings.sale_price_current_employees} />
          <Text name="sale_price_current_employees_max" label="… max (fourchette, optionnel)" type="number" defaultValue={settings.sale_price_current_employees_max} />
          <Text name="sale_price_ex_employees_vested" label="Ex-employés vestés" type="number" defaultValue={settings.sale_price_ex_employees_vested} />
          <Text name="sale_price_ex_employees_vested_max" label="… max (optionnel)" type="number" defaultValue={settings.sale_price_ex_employees_vested_max} />
          <Text name="sale_price_ex_employees_unvested" label="Ex-employés non-vestés" type="number" defaultValue={settings.sale_price_ex_employees_unvested} />
          <Text name="sale_price_ex_employees_unvested_max" label="… max (optionnel)" type="number" defaultValue={settings.sale_price_ex_employees_unvested_max} />
        </div>
      </Section>

      <Section title="Plafonds">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Text name="min_pct_current_employees" label="% min employés actuels" type="number" defaultValue={settings.min_pct_current_employees} hint="Plancher de la fourchette (ex. 20)." />
          <Text name="max_pct_current_employees" label="% max employés actuels" type="number" defaultValue={settings.max_pct_current_employees} hint="Plafond (ex. 50). Bridé au % vesté." />
          <Text name="max_pct_ex_employees" label="% max ex-employés" type="number" defaultValue={settings.max_pct_ex_employees} />
        </div>
        <Toggle
          name="ex_employees_all_or_nothing"
          label="Tout ou rien pour les ex-employés"
          defaultChecked={isTrue(settings.ex_employees_all_or_nothing)}
          hint="Activé : réponse binaire oui/non. Désactivé : curseur de pourcentage."
        />
      </Section>

      <Section title="Support & contenu">
        <Text name="support_email" label="Email de support" type="email" defaultValue={settings.support_email} />
        <label className="block">
          <span className="text-sm font-medium text-matera-ink">FAQ (markdown)</span>
          <span className="block text-xs text-matera-muted">Sections séparées par des titres « ## ».</span>
          <textarea
            name="faq_markdown"
            rows={8}
            defaultValue={settings.faq_markdown ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-matera-primary focus:ring-2 focus:ring-matera-primary/20"
          />
        </label>
      </Section>

      <Section title="Mode test">
        <Toggle
          name="test_mode"
          label="Activer le mode test"
          defaultChecked={isTrue(settings.test_mode)}
          hint="Le sondage affiche « MODE TEST » et les réponses ne sont pas enregistrées."
        />
      </Section>

      <div className="flex items-center gap-4">
        <Save />
        {state.message && <span className="text-sm text-emerald-700">{state.message}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
