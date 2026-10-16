import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";
import { factuurJson } from "@/lib/mobiel-json";

const OPEN = ["verzonden", "herinnerd", "aangemaand"];

/** Facturen, nieuwste eerst. ?filter=open|telaat|concept|betaald|alle, ?q=, ?klant=id. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "alle";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const klant = url.searchParams.get("klant") ?? "";
  const nu = new Date();
  const where: Record<string, unknown> = { ondernemingId: o.id };
  if (filter === "open") where.status = { in: OPEN };
  else if (filter === "telaat") Object.assign(where, { status: { in: OPEN }, vervaldatum: { lt: nu } });
  else if (filter === "concept") where.status = "concept";
  else if (filter === "betaald") where.status = "betaald";
  if (q) where.OR = [{ nummer: { contains: q, mode: "insensitive" } }, { referentie: { contains: q, mode: "insensitive" } }, { klant: { naam: { contains: q, mode: "insensitive" } } }];
  if (klant) where.klantId = klant;
  const [facturen, open, teLaat, concept] = await Promise.all([
    db.factuur.findMany({ where, orderBy: { datum: "desc" }, take: 200, include: { klant: { select: { naam: true, email: true } } } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: OPEN } }, select: { totaal: true, betaaldBedrag: true, vervaldatum: true } }),
    db.factuur.count({ where: { ondernemingId: o.id, status: { in: OPEN }, vervaldatum: { lt: nu } } }),
    db.factuur.count({ where: { ondernemingId: o.id, status: "concept" } }),
  ]);
  return NextResponse.json({
    facturen: facturen.map(factuurJson),
    tellers: { open: open.length, openBedrag: open.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0), teLaat, concept },
  });
});
