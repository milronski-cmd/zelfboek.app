import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bonJson, fout, mobielContext, route } from "@/lib/mobiel";
import { transactieVolJson } from "@/lib/mobiel-json";

/** Eén bon: uitgelezen gegevens, regels, de gekoppelde betaling en kandidaat-betalingen om aan te koppelen. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o } = await mobielContext(req);
  const { id } = await params;
  const b = await db.bon.findFirst({ where: { id, ondernemingId: o.id }, include: { transactie: { include: { bankrekening: { select: { naam: true } } } } } });
  if (!b) return fout(404, "Bon niet gevonden.");
  const kandidaten = !b.transactie && b.totaal
    ? await db.transactie.findMany({
        where: { ondernemingId: o.id, bonId: null, bedrag: { lt: 0 }, ...(b.datum ? { datum: { gte: new Date(b.datum.getTime() - 45 * 864e5), lte: new Date(b.datum.getTime() + 45 * 864e5) } } : {}) },
        orderBy: { datum: "desc" }, take: 15, include: { bankrekening: { select: { naam: true } } },
      })
    : [];
  let regels: { omschrijving: string; bedrag: number; btw: number }[] = [];
  try { regels = b.regelsJson ? JSON.parse(b.regelsJson) : []; } catch { regels = []; }
  return NextResponse.json({
    bon: { ...bonJson(b), mimeType: b.mimeType, bron: b.bron, leverancierBtw: b.leverancierBtw, factuurnummer: b.factuurnummer, btwBedrag: b.btwBedrag, btwCode: b.btwCode, categorie: b.categorie, zekerheid: b.zekerheid, aangemaakt: b.aangemaakt.toISOString(), regels },
    transactie: b.transactie ? transactieVolJson(b.transactie) : null,
    kandidaten: kandidaten.map(transactieVolJson),
    bestand: `/api/bonnen/${b.id}/bestand`,
  });
});
