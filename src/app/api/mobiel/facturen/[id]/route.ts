import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { OPEN_STATUS } from "@/lib/facturen/status";
import { factuurUrl } from "@/lib/facturen/link";
import { peppolAan, peppolId } from "@/lib/indienen";
import { fout, mobielContext, route } from "@/lib/mobiel";
import { factuurJson, klantJson, transactieVolJson } from "@/lib/mobiel-json";

/** Eén factuur met klant, tijdlijn, betalingen, creditfacturen en kandidaat-betalingen om af te letteren. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o } = await mobielContext(req);
  const { id } = await params;
  const f = await db.factuur.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, transacties: true, offerte: { select: { id: true, nummer: true } } } });
  if (!f) return fout(404, "Factuur niet gevonden.");
  const isOpen = OPEN_STATUS.includes(f.status);
  const open = rond(f.totaal - f.betaaldBedrag);
  const [credits, origineel, kandidaten] = await Promise.all([
    db.factuur.findMany({ where: { gecrediteerdDoorId: f.id }, select: { id: true, nummer: true } }),
    f.gecrediteerdDoorId ? db.factuur.findUnique({ where: { id: f.gecrediteerdDoorId }, select: { id: true, nummer: true } }) : null,
    isOpen
      ? db.transactie.findMany({ where: { ondernemingId: o.id, factuurId: null, bedrag: { gte: open - 1, lte: open + 1 }, datum: { gte: new Date(f.datum.getTime() - 7 * 864e5) } }, orderBy: { datum: "desc" }, take: 5 })
      : [],
  ]);
  const tijdlijn = [
    { d: f.aangemaakt, t: "Aangemaakt" },
    ...(f.verzondenOp ? [{ d: f.verzondenOp, t: `Verzonden naar ${f.klant.email ?? "de klant"}` }] : []),
    ...(f.geopendOp ? [{ d: f.geopendOp, t: `Geopend door ${f.klant.naam}${f.geopendKeer > 1 ? ` (${f.geopendKeer} keer)` : ""}` }] : []),
    ...(f.laatsteHerinnering ? [{ d: f.laatsteHerinnering, t: `${f.status === "aangemaand" ? "Aanmaning" : "Herinnering"} ${f.herinneringen} verstuurd` }] : []),
    ...f.transacties.map((t) => ({ d: t.datum, t: `Betaling van € ${t.bedrag.toFixed(2).replace(".", ",")} ontvangen van ${t.tegenpartij}` })),
    ...(f.betaaldOp ? [{ d: f.betaaldOp, t: "Volledig betaald" }] : []),
  ].sort((a, b) => a.d.getTime() - b.d.getTime()).map((x) => ({ datum: x.d.toISOString(), tekst: x.t }));
  return NextResponse.json({
    factuur: factuurJson(f),
    klant: klantJson(f.klant),
    open,
    isOpen,
    teLaat: isOpen && f.vervaldatum < new Date(),
    tijdlijn,
    betalingen: f.transacties.map(transactieVolJson),
    credits,
    origineel,
    offerte: f.offerte,
    kandidaten: kandidaten.map(transactieVolJson),
    peppol: peppolAan() && Boolean(peppolId(f.klant)),
    link: factuurUrl(f.id),
    pdf: `/api/facturen/${f.id}/pdf`,
    ubl: `/api/facturen/${f.id}/ubl`,
  });
});
