import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/service";
import { DEMO_MODE, DEMO_MODREQS_COOKIE, parseDemoModreqs } from "@/lib/demo";
import { getDemoHolderByEmail } from "@/lib/demo-data";
import { approveRequest, rejectRequest } from "./actions";
import type { ModificationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface RequestRow {
  id: string; // holder_id (real) / email (demo)
  name: string;
  email: string;
  status: ModificationStatus;
  createdAt: string | null;
}

async function loadRequests(): Promise<RequestRow[]> {
  if (DEMO_MODE) {
    const modreqs = parseDemoModreqs(cookies().get(DEMO_MODREQS_COOKIE)?.value);
    return Object.entries(modreqs).map(([email, r]) => {
      const h = getDemoHolderByEmail(email);
      return {
        id: email,
        name: h ? `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || email : email,
        email,
        status: r.status,
        createdAt: r.created_at,
      };
    });
  }
  const svc = createServiceSupabase();
  const { data } = await svc
    .from("modification_requests")
    .select("holder_id, status, created_at, holders(first_name, last_name, email)")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r: Record<string, unknown>) => {
    const h = (r.holders ?? {}) as { first_name?: string; last_name?: string; email?: string };
    return {
      id: r.holder_id as string,
      name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || (h.email ?? ""),
      email: h.email ?? "",
      status: r.status as ModificationStatus,
      createdAt: (r.created_at as string) ?? null,
    };
  });
}

export default async function RequestsPage() {
  const rows = await loadRequests();
  const pending = rows.filter((r) => r.status === "pending");
  const resolved = rows.filter((r) => r.status !== "pending");

  return (
    <div>
      <h1 className="text-lg font-semibold text-matera-ink">Demandes de modification</h1>
      <p className="mt-1 text-sm text-matera-muted">
        Quand un détenteur souhaite modifier sa réponse verrouillée, sa demande
        apparaît ici. L&apos;approuver déverrouille sa réponse pour une édition.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-matera-ink">
        En attente ({pending.length})
      </h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-matera-muted">
              <th className="px-3 py-2 font-medium">Détenteur</th>
              <th className="px-3 py-2 font-medium">Demandée le</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-matera-ink">{r.name}</div>
                  <div className="text-xs text-matera-muted">{r.email}</div>
                </td>
                <td className="px-3 py-2 text-xs text-matera-muted">
                  {r.createdAt ? r.createdAt.slice(0, 16).replace("T", " ") : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <form action={approveRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:opacity-90">
                        Approuver
                      </button>
                    </form>
                    <form action={rejectRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                        Refuser
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-matera-muted">
                  Aucune demande en attente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resolved.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-matera-ink">Traitées</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {resolved.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded bg-white px-3 py-1.5">
                <span>{r.name}</span>
                <span className={r.status === "approved" ? "text-emerald-700" : "text-red-600"}>
                  {r.status === "approved" ? "Approuvée" : "Refusée"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
