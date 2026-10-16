import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openstaandPerKlant } from "@/lib/facturen/betaling";
import { mobielContext, route } from "@/lib/mobiel";
import { klantJson } from "@/lib/mobiel-json";

/** Klanten op naam, met wat open staat en de omzet van dit jaar. ?q= zoekt op naam. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const [klanten, open, omzet] = await Promise.all([
    db.klant.findMany({ where: { ondernemingId: o.id, ...(q ? { naam: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { naam: "asc" }, include: { _count: { select: { facturen: true } } } }),
    openstaandPerKlant(o.id),
    db.factuur.groupBy({ by: ["klantId"], where: { ondernemingId: o.id, status: "betaald", datum: { gte: new Date(new Date().getFullYear(), 0, 1) } }, _sum: { subtotaal: true } }),
  ]);
  const omzetMap = new Map(omzet.map((x) => [x.klantId, x._sum.subtotaal ?? 0]));
  return NextResponse.json({
    klanten: klanten.map((k) => ({ ...klantJson(k), facturen: k._count.facturen, open: open.get(k.id) ?? 0, omzetJaar: omzetMap.get(k.id) ?? 0 })),
  });
});
