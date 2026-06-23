"use client";

import { useFormState, useFormStatus } from "react-dom";
import { demoLogin, type DemoLoginState } from "./demo-actions";

const initial: DemoLoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 w-full rounded-lg bg-matera-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export default function DemoLoginForm() {
  const [state, formAction] = useFormState(demoLogin, initial);

  return (
    <form action={formAction} className="mt-6">
      <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        MODE DÉMO — données fictives, sans base de données.
      </div>
      <label htmlFor="email" className="block text-sm font-medium text-matera-ink">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        defaultValue="enzo.barel@matera.eu"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-matera-primary focus:ring-2 focus:ring-matera-primary/20"
      />
      <label htmlFor="password" className="mt-3 block text-sm font-medium text-matera-ink">
        Mot de passe
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-matera-primary focus:ring-2 focus:ring-matera-primary/20"
      />
      <SubmitButton />
      {state.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
