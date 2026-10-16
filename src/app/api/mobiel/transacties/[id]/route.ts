import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { btwUitInclusief } from "@/lib/btw";
import { fout, mobielContext, route, transactieJson } from "@/lib/mobiel";
import { bonJson } from "@/lib/mobiel";
import { transactieVolJson } from "@/lib/mobiel-json";

/** Eén bankregel met bon, factuur en de open facturen die erbij zouden kunnen horen. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o } = await mobielContext(req);
  const { id } = await params;
  const t = await db.transactie.findFirst({ where: { id, ondernemingId: o.id }, include: { bon: true, bankrekening: { select: { naam: true } }, factuur: { select: { id: true, nummer: true } } } });
  if (!t) return fout(404, "Bankregel niet gevonden.");
  const openFacturen = t.bedrag > 0 && !t.factuurId
    ? await db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand"] } }, include: { klant: { select: { naam: true } } }, orderBy: { datum: "desc" }, take: 10 })
    : [];
  return NextResponse.json({
    regel: transactieVolJson(t),
    bon: t.bon ? bonJson(t.bon) : null,
    openFacturen: openFacturen.map((f) => ({ id: f.id, nummer: f.nummer, klant: f.klant.naam, open: f.totaal - f.betaaldBedrag })),
  });
});

/** Eén bankregel bevestigen als zakelijk of privé. Body: { keuze: "zakelijk" | "prive" }. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o, schrijfFout } = await mobielContext(req);
  if (schrijfFout) return fout(403, schrijfFout);
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { keuze?: string };
  if (body.keuze !== "zakelijk" && body.keuze !== "prive") return fout(400, "Keuze moet zakelijk of prive zijn.");
  const t = await db.transactie.findFirst({ where: { id, ondernemingId: o.id } });
  if (!t) return fout(404, "Bankregel niet gevonden.");
  const zakelijk = body.keuze === "zakelijk";
  const regel = await db.transactie.update({
    where: { id: t.id },
    data: {
      zakelijk,
      categorie: zakelijk ? t.categorie ?? "overig" : "prive",
      btwCode: zakelijk ? t.btwCode ?? "21" : "geen",
      btwBedrag: zakelijk ? btwUitInclusief(Math.abs(t.bedrag), t.btwCode ?? "21") : 0,
      bevestigd: true,
      zekerheid: 1,
      uitleg: zakelijk ? "Door jou bevestigd als zakelijk" : "Door jou gemarkeerd als privé",
    },
  });
  return NextResponse.json({ ok: true, regel: transactieJson(regel) });
});
