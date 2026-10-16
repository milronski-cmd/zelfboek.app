import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jaarrekening } from "@/lib/fiscaal/jaarrekening";
import { boekAfschrijvingen } from "@/lib/fiscaal/afschrijving";
import { CATEGORIEEN, CATEGORIE_INFO } from "@/lib/categorieen";
import { mobielContext, route } from "@/lib/mobiel";

/** Jaarrekening (?jaar=): winst-en-verlies, balans, kengetallen, correcties en of het jaar is afgesloten. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const nu = new Date();
  const jaar = Number(new URL(req.url).searchParams.get("jaar")) || nu.getFullYear();
  const peil = jaar < nu.getFullYear() ? new Date(jaar, 11, 31) : nu;
  await boekAfschrijvingen(o.id, peil);
  const [jr, afgesloten, memoriaal] = await Promise.all([
    jaarrekening(o.id, jaar),
    db.aangifte.findUnique({ where: { ondernemingId_soort_jaar_periode: { ondernemingId: o.id, soort: "jaarafsluiting", jaar, periode: 0 } } }),
    db.memoriaalboeking.findMany({ where: { ondernemingId: o.id, datum: { gte: new Date(jaar, 0, 1), lt: new Date(jaar + 1, 0, 1) }, soort: { not: "afschrijving" } }, orderBy: { datum: "desc" }, take: 50 }),
  ]);
  return NextResponse.json({
    jaar, afgesloten: Boolean(afgesloten), afgeslotenOp: afgesloten?.ingediendOp?.toISOString() ?? null,
    wv: { omzet: jr.wv.omzet, kosten: jr.wv.kosten, kostenAftrekbaar: jr.wv.kostenAftrekbaar, afschrijving: jr.wv.afschrijving, winst: jr.wv.winst, fiscaleWinst: jr.wv.fiscaleWinst, omzetRegels: jr.wv.omzetRegels, kostenRegels: jr.wv.kostenRegels },
    activa: jr.activa, passiva: jr.passiva, totaalActiva: jr.totaalActiva, totaalPassiva: jr.totaalPassiva, eigenVermogen: jr.eigenVermogen, kengetallen: jr.kengetallen,
    memoriaal: memoriaal.map((m) => ({ id: m.id, datum: m.datum.toISOString(), omschrijving: m.omschrijving, bedrag: m.bedrag, categorie: m.categorie, btwCode: m.btwCode, btwBedrag: m.btwBedrag, soort: m.soort })),
    categorieen: CATEGORIEEN.map((c) => ({ k: c, label: CATEGORIE_INFO[c].label })),
    pdf: `/api/exports/jaarrekening-pdf?jaar=${jaar}`,
  });
});
