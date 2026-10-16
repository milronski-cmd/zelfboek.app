import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRegels } from "@/lib/facturen/bereken";
import { mobielContext, route } from "@/lib/mobiel";

/** Vaste (terugkerende) facturen. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const lijst = await db.terugkerendeFactuur.findMany({ where: { ondernemingId: o.id }, include: { klant: { select: { naam: true } }, _count: { select: { facturen: true } } }, orderBy: { volgendeOp: "asc" } });
  return NextResponse.json({
    lijst: lijst.map((t) => ({
      id: t.id, klantId: t.klantId, klant: t.klant.naam, omschrijving: t.omschrijving, regels: parseRegels(t.regels), interval: t.interval, volgendeOp: t.volgendeOp.toISOString(),
      eindigtOp: t.eindigtOp?.toISOString() ?? null, autoVerzenden: t.autoVerzenden, actief: t.actief, aantal: t._count.facturen,
      totaal: parseRegels(t.regels).reduce((s, r) => s + r.aantal * r.prijs, 0),
    })),
  });
});
