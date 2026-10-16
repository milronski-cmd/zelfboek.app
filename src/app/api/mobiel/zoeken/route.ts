import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";
import { bonJson } from "@/lib/mobiel";
import { factuurJson, klantJson, offerteJson, transactieVolJson } from "@/lib/mobiel-json";

/** Zoeken door betalingen, facturen, offertes, klanten en bonnen (?q=), zoals /app/zoeken. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const term = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!term) return NextResponse.json({ transacties: [], facturen: [], offertes: [], klanten: [], bonnen: [] });
  const bevat = { contains: term, mode: "insensitive" as const };
  const getal = Number(term.replace(/\./g, "").replace(",", "."));
  const bedrag = Number.isFinite(getal) && /\d/.test(term) ? Math.abs(getal) : null;
  const [transacties, facturen, offertes, klanten, bonnen] = await Promise.all([
    db.transactie.findMany({ where: { ondernemingId: o.id, OR: [{ tegenpartij: bevat }, { omschrijving: bevat }, ...(bedrag != null ? [{ bedrag: { in: [bedrag, -bedrag] } }] : [])] }, orderBy: { datum: "desc" }, take: 25 }),
    db.factuur.findMany({ where: { ondernemingId: o.id, OR: [{ nummer: bevat }, { referentie: bevat }, { klant: { naam: bevat } }, ...(bedrag != null ? [{ totaal: bedrag }] : [])] }, include: { klant: { select: { naam: true, email: true } } }, orderBy: { datum: "desc" }, take: 25 }),
    db.offerte.findMany({ where: { ondernemingId: o.id, OR: [{ nummer: bevat }, { klant: { naam: bevat } }] }, include: { klant: { select: { naam: true, email: true } } }, orderBy: { datum: "desc" }, take: 10 }),
    db.klant.findMany({ where: { ondernemingId: o.id, OR: [{ naam: bevat }, { email: bevat }, { contactpersoon: bevat }, { plaats: bevat }] }, orderBy: { naam: "asc" }, take: 25 }),
    db.bon.findMany({ where: { ondernemingId: o.id, OR: [{ leverancier: bevat }, { factuurnummer: bevat }, { bestandsnaam: bevat }, ...(bedrag != null ? [{ totaal: bedrag }] : [])] }, orderBy: { aangemaakt: "desc" }, take: 25 }),
  ]);
  return NextResponse.json({ transacties: transacties.map(transactieVolJson), facturen: facturen.map(factuurJson), offertes: offertes.map(offerteJson), klanten: klanten.map(klantJson), bonnen: bonnen.map(bonJson) });
});
