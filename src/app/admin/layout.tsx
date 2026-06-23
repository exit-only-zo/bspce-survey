import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { logAccess } from "@/lib/logging";
import { signOut } from "@/app/auth/logout-action";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/settings", label: "Paramètres" },
  { href: "/admin/holders", label: "Détenteurs" },
  { href: "/admin/responses", label: "Réponses" },
  { href: "/admin/requests", label: "Demandes" },
  { href: "/admin/overrides", label: "Surcharges" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/faq", label: "FAQ" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, isAdmin } = await getSessionContext();
  if (!email) redirect("/login");
  if (!isAdmin) redirect("/survey");

  await logAccess(email, "/admin");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold text-matera-ink">
            Matera · Administration BSPCE
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-matera-muted">{email}</span>
            <form action={signOut}>
              <button className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-matera-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
