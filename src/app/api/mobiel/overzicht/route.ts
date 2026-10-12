import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { btwAangifte, btwDeadline, periodeBereik, rond } from "@/lib/btw";
import { CATEGORIE_INFO } from "@/lib/categorieen";
import { huidigTijdvak } from "@/lib/assistent/tools";
import { mobielContext, route } from "@/lib/mobiel";
import { btwRegels } from "@/lib/btw-bron";

/** Startscherm van de app: saldo, wat aandacht vraagt, open facturen, deze maand, btw en meldingen. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const nu = new Date();
  const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1);
  const tv = huidigTijdvak(o.btwTijdvak);
  const { start, eind } = periodeBereik(o.btwTijdvak, tv.jaar, tv.periode || 1);

  const [rekeningen, mutaties, twijfel, openFacturen, maandRegels, tijdvakRegels, meldingen] = await Promise.all([
    db.bankrekening.findMany({ where: { ondernemingId: o.id } }),
    db.transactie.groupBy({ by: ["bankrekeningId"], where: { ondernemingId: o.id }, _sum: { bedrag: true } }),
    db.transactie.count({ where: { ondernemingId: o.id, bevestigd: false, zakelijk: { not: null } } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand"] } }, select: { totaal: true, betaaldBedrag: true } }),
    db.transactie.findMany({ where: { ondernemingId: o.id, zakelijk: true, datum: { gte: maandStart } }, select: { bedrag: true, btwBedrag: true, priveDeel: true, categorie: true } }),
    btwRegels(o.id, start, eind),
    db.melding.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 10 }),
  ]);

  let banksaldo: number | null = null;
  if (rekeningen.length > 0) {
    banksaldo = rekeningen.reduce((s, r) => s + (r.saldo ?? mutaties.find((m) => m.bankrekeningId === r.id)?._sum.bedrag ?? 0), 0);
  } else {
    const los = mutaties.find((m) => m.bankrekeningId === null)?._sum.bedrag;
    if (los != null) banksaldo = los;
  }

  const excl = (t: { bedrag: number; btwBedrag: number | null; priveDeel: number }) => (Math.abs(t.bedrag) - (t.btwBedrag ?? 0)) * (1 - t.priveDeel);
  let omzetMaand = 0;
  let kostenMaand = 0;
  for (const t of maandRegels) {
    const soort = t.categorie && t.categorie in CATEGORIE_INFO ? CATEGORIE_INFO[t.categorie as keyof typeof CATEGORIE_INFO].soort : "kosten";
    if (soort === "omzet") omzetMaand += excl(t);
    else if (soort === "kosten") kostenMaand += excl(t);
  }

  const aangifte = btwAangifte(tijdvakRegels);
  const label = o.btwTijdvak === "maand" ? `${start.toLocaleDateString("nl-NL", { month: "long" })} ${tv.jaar}` : o.btwTijdvak === "jaar" ? `${tv.jaar}` : `Q${tv.periode} ${tv.jaar}`;

  return NextResponse.json({
    onderneming: { id: o.id, naam: o.naam },
    banksaldo: banksaldo == null ? null : rond(banksaldo),
    twijfel,
    openFacturen: { aantal: openFacturen.length, bedrag: rond(openFacturen.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0)) },
    omzetMaand: rond(omzetMaand),
    kostenMaand: rond(kostenMaand),
    btw: { label, teBetalen: aangifte["5c_te_betalen"], deadline: btwDeadline(eind).toISOString() },
    meldingen: meldingen.map((m) => ({ id: m.id, titel: m.titel, tekst: m.tekst, aangemaakt: m.aangemaakt.toISOString(), link: m.link })),
  });
});
