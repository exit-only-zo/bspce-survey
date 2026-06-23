import { NextResponse } from "next/server";

// Liveness probe (public). Does not touch the database or reveal config.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
