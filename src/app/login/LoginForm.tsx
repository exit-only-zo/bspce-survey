"use client";

import { useFormState, useFormStatus } from "react-dom";
import { adminLogin, type LoginState } from "./actions";

const initial: LoginState = { error: null };

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

export default function LoginForm() {
  const [state, formAction] = useFormState(adminLogin, initial);

  return (
    <form action={formAction} className="mt-6">
      <label htmlFor="email" className="block text-sm font-medium text-matera-ink">
        Adresse email administrateur
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="prenom.nom@matera.eu"
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
        required
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-matera-primary focus:ring-2 focus:ring-matera-primary/20"
      />
      <SubmitButton />
      {state.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
