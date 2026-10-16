import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { afschrijvingsschema, boekresultaatVerkoop, boekwaarde } from "@/lib/fiscaal/afschrijving";
import { kiaBerekening } from "@/lib/fiscaal/ib";
import { INVESTERINGSGRENS } from "@/lib/fiscaal/constanten-2026";
import { mobielContext, route } from "@/lib/mobiel";
import { transactieVolJson } from "@/lib/mobiel-json";

/** Grote aankopen (activa) met boekwaarde, afschrijvingsschema, KIA en bankregels die een investering kunnen zijn. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const nu = new Date();
  const jaar = nu.getFullYear();
  const [activa, kandidaten] = await Promise.all([
    db.activum.findMany({ where: { ondernemingId: o.id }, orderBy: { aanschafDatum: "desc" } }),
    db.transactie.findMany({
      where: { ondernemingId: o.id, activumId: null, zakelijk: true, bedrag: { lt: -INVESTERINGSGRENS * 1.21 }, OR: [{ categorie: "investering" }, { categorie: "apparatuur" }] },
      orderBy: { datum: "desc" }, take: 10,
    }),
  ]);
  const investeringenDitJaar = activa.filter((a) => a.aanschafDatum.getFullYear() === jaar && a.kiaToegepast).reduce((s, a) => s + a.aanschafBedrag * (1 - a.priveDeel), 0);
  return NextResponse.json({
    grens: INVESTERINGSGRENS,
    kia: kiaBerekening(investeringenDitJaar),
    investeringenDitJaar: rond(investeringenDitJaar),
    totaalBoekwaarde: rond(activa.filter((a) => !a.verkochtOp).reduce((s, a) => s + boekwaarde(a, nu).boekwaarde, 0)),
    afschrijvingJaar: rond(activa.reduce((s, a) => s + (afschrijvingsschema(a).find((r) => r.jaar === jaar)?.afschrijving ?? 0), 0)),
    activa: activa.map((a) => ({
      id: a.id, naam: a.naam, categorie: a.categorie, aanschafDatum: a.aanschafDatum.toISOString(), aanschafBedrag: a.aanschafBedrag, restwaarde: a.restwaarde, looptijdJaren: a.looptijdJaren,
      kiaToegepast: a.kiaToegepast, priveDeel: a.priveDeel, verkochtOp: a.verkochtOp?.toISOString() ?? null, verkoopBedrag: a.verkoopBedrag,
      boekwaarde: rond(boekwaarde(a, nu).boekwaarde), boekresultaat: boekresultaatVerkoop(a), schema: afschrijvingsschema(a),
    })),
    kandidaten: kandidaten.map(transactieVolJson),
  });
});
