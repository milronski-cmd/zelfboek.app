import { NextResponse } from "next/server";
import { controleerStatus } from "@/lib/status";

/** Voor een uptime-dienst: 200 als de app en de database werken, anders 503. Geen gegevens van klanten. */
export async function GET() {
  const s = await controleerStatus();
  const ok = s[0]?.ok === true;
  return NextResponse.json({ ok, onderdelen: s.map((x) => ({ naam: x.naam, ok: x.ok })) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
