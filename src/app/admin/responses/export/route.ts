import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { computeDashboard } from "@/lib/dashboard";
import { logAudit } from "@/lib/logging";

export const dynamic = "force-dynamic";

// CSV of the individual responses. Admin-only. Uses ';' delimiter + UTF-8 BOM
// so French Excel opens it cleanly with accents intact.
function csvCell(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const { isAdmin, email } = await getSessionContext();
  if (!isAdmin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const settings = await getSettings();
  const d = await computeDashboard(settings);

  const header = [
    "Nom",
    "Email",
    "Type",
    "Titres totaux",
    "Actions ordinaires",
    "Réponse",
    "A répondu",
    "Titres indiqués à la vente",
    "Produit indicatif min (EUR)",
    "Produit indicatif max (EUR)",
    "Soumis le",
    "Modifié le",
    "Surcharge",
  ];

  const lines = [header.join(";")];
  for (const r of d.rows) {
    lines.push(
      [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.type === "current_employee" ? "Employé actuel" : "Ex-employé"),
        csvCell(r.totalWarrants),
        csvCell(r.ordinaryShares),
        csvCell(r.responseLabel),
        csvCell(r.hasResponse ? "Oui" : "Non"),
        csvCell(r.titlesOffered),
        csvCell(Math.round(r.proceedsMin)),
        csvCell(Math.round(r.proceedsMax)),
        csvCell(r.submittedAt ?? ""),
        csvCell(r.lastModifiedAt ?? ""),
        csvCell(r.hasOverride ? "Oui" : "Non"),
      ].join(";"),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  await logAudit({ actorEmail: email, action: "responses.exported", target: `${d.rows.length} lignes` });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reponses-bspce-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
