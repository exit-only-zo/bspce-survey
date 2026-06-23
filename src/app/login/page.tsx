import LoginForm from "./LoginForm";
import DemoLoginForm from "./DemoLoginForm";
import { DEMO_MODE } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-matera-ink">
          Matera — Espace administrateur BSPCE
        </h1>
        <p className="mt-2 text-sm text-matera-muted">
          {DEMO_MODE
            ? "Connectez-vous avec vos identifiants de démonstration."
            : "Réservé aux administrateurs. Saisissez votre email professionnel pour recevoir un lien de connexion."}
        </p>
        {DEMO_MODE ? <DemoLoginForm /> : <LoginForm />}
        <div className="mt-6 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-matera-muted">
          <strong className="text-matera-ink">Vous êtes détenteur de BSPCE ?</strong> Vous
          n&apos;avez pas besoin de mot de passe : utilisez le lien personnel qui vous a
          été envoyé par email pour accéder directement à votre sondage.
        </div>
        <p className="mt-4 text-xs leading-relaxed text-matera-muted">
          Information strictement confidentielle — Matera SAS. Tout accès fait
          l&apos;objet d&apos;une journalisation.
        </p>
      </div>
    </main>
  );
}
