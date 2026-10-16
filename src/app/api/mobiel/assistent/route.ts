import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weergaveBerichten } from "@/lib/assistent/chat";
import { aiSleutelAanwezig } from "@/lib/ai";
import { mobielContext, route } from "@/lib/mobiel";

/** Eerdere gesprekken met de assistent; ?id= geeft de berichten van één gesprek. Chatten zelf gaat via POST /api/assistent (NDJSON). */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const id = new URL(req.url).searchParams.get("id");
  const [gesprekken, huidig] = await Promise.all([
    db.gesprek.findMany({ where: { ondernemingId: o.id }, orderBy: { bijgewerkt: "desc" }, take: 30, select: { id: true, titel: true, bijgewerkt: true } }),
    id ? db.gesprek.findFirst({ where: { id, ondernemingId: o.id } }) : null,
  ]);
  return NextResponse.json({
    beschikbaar: aiSleutelAanwezig(),
    gesprekken: gesprekken.map((g) => ({ id: g.id, titel: g.titel ?? "Gesprek", bijgewerkt: g.bijgewerkt.toISOString() })),
    berichten: huidig ? weergaveBerichten(huidig.berichten) : [],
    voorbeelden: ["Hoeveel btw moet ik dit kwartaal betalen?", "Welke facturen staan open?", "Wat was mijn grootste kostenpost vorige maand?", "Hoe sta ik ervoor?"],
  });
});
