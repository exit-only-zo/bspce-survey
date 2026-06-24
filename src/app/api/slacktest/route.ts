import { NextResponse, type NextRequest } from "next/server";

// TEMPORARY — verify the Slack webhook + env wiring end-to-end. Remove after.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("key") !== "diag2026") {
    return new NextResponse("not found", { status: 404 });
  }
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json({ ok: false, reason: "SLACK_WEBHOOK_URL absent au runtime" });
  }
  const sample =
    "🔔 *Test BSPCE* — exemple de notification : 📩 Jean Dupont (ex-employé) a répondu : ✅ Oui — cession 100 % — ~12 885 € (1 500 titres)";
  let status = 0;
  let body = "";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sample }),
    });
    status = r.status;
    body = (await r.text()).slice(0, 100);
  } catch (e) {
    body = `fetch threw: ${(e as Error).message}`;
  }
  return NextResponse.json({ ok: status === 200, status, body, urlPresent: true });
}
