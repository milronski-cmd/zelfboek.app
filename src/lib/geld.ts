import type { Onderneming } from "@prisma/client";
import { db } from "./db";
import { btwAangifte, btwDeadline, periodeBereik, rond } from "./btw";
import { winstVerlies } from "./fiscaal/winst";
import { berekenIb } from "./fiscaal/ib";
import { huidigTijdvak } from "./assistent/tools";
import { winkelSleutel } from "./vragen";
import { btwRegels } from "./btw-bron";

/**
 * "Saldo vooruit": wat je echt kunt uitgeven, hoe lang je geld reikt en wat je opzij zet.
 * Eén plek voor de IB-indicatie (ook de IB-pagina rekent hiermee), vaste lasten en de vooruitblik.
 */

/** Inkomstenbelasting-indicatie voor een jaar: tot nu en verwacht over het hele jaar. */
export async function ibIndicatie(o: Onderneming, jaar = new Date().getFullYear()) {
  const nu = new Date();
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const maanden = jaar === nu.getFullYear() ? nu.getMonth() + 1 : 12;
  const [wv, uren, km, activa, aov, alleRegels] = await Promise.all([
    winstVerlies(o.id, start, eind),
    db.urenregel.aggregate({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, _sum: { uren: true } }),
    db.kilometerregel.aggregate({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, _sum: { vergoeding: true } }),
    db.activum.findMany({ where: { ondernemingId: o.id, aanschafDatum: { gte: start, lt: eind }, kiaToegepast: true } }),
    db.transactie.aggregate({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, categorie: "aov" }, _sum: { bedrag: true } }),
    btwRegels(o.id, start, eind),
  ]);
  const urenTotaal = uren._sum.uren ?? 0;
  const kmVergoeding = km._sum.vergoeding ?? 0;
  const ib = berekenIb({
    fiscaleWinst: wv.fiscaleWinst,
    uren: urenTotaal,
    urenCriteriumGehaald: o.urencriterium ? true : undefined,
    starter: o.starter,
    investeringen: activa.reduce((s, a) => s + a.aanschafBedrag * (1 - a.priveDeel), 0),
    kilometerVergoeding: kmVergoeding,
    aovPremie: Math.abs(aov._sum.bedrag ?? 0),
    maandenVerstreken: maanden,
  });
  const verwachteWinst = Math.round((wv.fiscaleWinst / maanden) * 12);
  const ibJaar = maanden < 12
    ? berekenIb({ fiscaleWinst: verwachteWinst, uren: Math.round((urenTotaal / maanden) * 12), urenCriteriumGehaald: o.urencriterium ? true : undefined, starter: o.starter, investeringen: 0, kilometerVergoeding: (kmVergoeding / maanden) * 12 })
    : ib;
  return { jaar, maanden, wv, ib, ibJaar, verwachteWinst, urenTotaal, btwJaar: btwAangifte(alleRegels) };
}

export type VasteLast = { naam: string; bedrag: number; volgende: Date; perMaand: number; keer: number };

/**
 * Vaste lasten herkennen uit de bank: dezelfde ontvanger minstens drie keer in de laatste vijf maanden,
 * ongeveer elke maand (25 tot 35 dagen) en een bedrag dat weinig schommelt (binnen 15%).
 */
export async function vasteLasten(ondernemingId: string, nu = new Date()): Promise<VasteLast[]> {
  const vanaf = new Date(nu.getTime() - 155 * 864e5);
  const rijen = await db.transactie.findMany({
    where: { ondernemingId, bedrag: { lt: 0 }, datum: { gte: vanaf, lte: nu }, categorie: { notIn: ["overboeking_eigen", "btw_betaling", "belasting"] } },
    orderBy: { datum: "asc" },
    select: { tegenpartij: true, bedrag: true, datum: true },
  });
  const groepen = new Map<string, { naam: string; rijen: { bedrag: number; datum: Date }[] }>();
  for (const r of rijen) {
    const k = winkelSleutel(r.tegenpartij);
    if (!k) continue;
    const g = groepen.get(k) ?? { naam: r.tegenpartij, rijen: [] };
    g.rijen.push({ bedrag: Math.abs(r.bedrag), datum: r.datum });
    groepen.set(k, g);
  }
  const uit: VasteLast[] = [];
  for (const g of groepen.values()) {
    if (g.rijen.length < 3) continue;
    const gaten = g.rijen.slice(1).map((r, i) => (r.datum.getTime() - g.rijen[i].datum.getTime()) / 864e5);
    const maandelijks = gaten.filter((d) => d >= 25 && d <= 35).length >= Math.max(2, gaten.length - 1);
    if (!maandelijks) continue;
    const bedragen = g.rijen.map((r) => r.bedrag);
    const gem = bedragen.reduce((s, b) => s + b, 0) / bedragen.length;
    if (bedragen.some((b) => Math.abs(b - gem) > gem * 0.15)) continue;
    const laatste = g.rijen[g.rijen.length - 1];
    const interval = gaten.sort((a, b) => a - b)[Math.floor(gaten.length / 2)];
    // Maandelijks: zelfde dag van de volgende maand; anders het gemeten ritme.
    const stap = (d: Date) => (interval >= 25 && interval <= 35 ? new Date(d.getFullYear(), d.getMonth() + 1, laatste.datum.getDate()) : new Date(d.getTime() + interval * 864e5));
    let volgende = stap(laatste.datum);
    while (volgende < nu) volgende = stap(volgende);
    uit.push({ naam: g.naam, bedrag: rond(laatste.bedrag), volgende, perMaand: rond(gem * (30.4 / interval)), keer: g.rijen.length });
  }
  return uit.sort((a, b) => a.volgende.getTime() - b.volgende.getTime());
}

export type GeldVooruit = {
  banksaldo: number | null;
  btwTeBetalen: number;
  btwDeadline: Date;
  ibOpzij: number; // inkomstenbelasting over de winst tot nu, min wat je al via de voorlopige aanslag betaalde
  ibBetaald: number;
  vrij: number | null;
  vasteLasten: VasteLast[];
  vasteLastenPerMaand: number;
  priveGemiddeld: number;
  teOntvangen: number;
  reiktTot: Date | null; // null = langer dan een jaar
  krap: boolean; // geld raakt binnen een maand op
  reiktTekst: string; // "14 maart", "nu al te krap" of "na oktober 2027"
  potjePerMaand: { btw: number; ib: number };
};

/** Alles voor de tegels "Vrij te besteden", "Je geld reikt tot" en het belastingpotje. */
export async function geldVooruit(o: Onderneming): Promise<GeldVooruit> {
  const nu = new Date();
  const tv = huidigTijdvak(o.btwTijdvak);
  const huidig = periodeBereik(o.btwTijdvak, tv.jaar, tv.periode || 1);
  // Vorig tijdvak telt mee zolang die aangifte niet als betaald staat.
  const vorigeEinde = huidig.start;
  const vorigeStart = o.btwTijdvak === "maand" ? new Date(vorigeEinde.getFullYear(), vorigeEinde.getMonth() - 1, 1) : o.btwTijdvak === "jaar" ? new Date(vorigeEinde.getFullYear() - 1, 0, 1) : new Date(vorigeEinde.getFullYear(), vorigeEinde.getMonth() - 3, 1);
  const vorigePeriode = o.btwTijdvak === "maand" ? vorigeStart.getMonth() + 1 : o.btwTijdvak === "jaar" ? 0 : Math.floor(vorigeStart.getMonth() / 3) + 1;

  const [rekeningen, mutaties, nuRegels, vorigeRegels, vorigeAangifte, open, prive, lasten, ib, fiscus] = await Promise.all([
    db.bankrekening.findMany({ where: { ondernemingId: o.id } }),
    db.transactie.groupBy({ by: ["bankrekeningId"], where: { ondernemingId: o.id }, _sum: { bedrag: true } }),
    btwRegels(o.id, huidig.start, huidig.eind),
    btwRegels(o.id, vorigeStart, vorigeEinde),
    db.aangifte.findFirst({ where: { ondernemingId: o.id, soort: "btw", jaar: vorigeStart.getFullYear(), periode: vorigePeriode } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand"] } }, select: { totaal: true, betaaldBedrag: true, vervaldatum: true } }),
    db.transactie.aggregate({ where: { ondernemingId: o.id, zakelijk: false, bedrag: { lt: 0 }, datum: { gte: new Date(nu.getTime() - 91 * 864e5) } }, _sum: { bedrag: true } }),
    vasteLasten(o.id, nu),
    ibIndicatie(o),
    db.transactie.findMany({ where: { ondernemingId: o.id, bedrag: { lt: 0 }, tegenpartij: { contains: "elastingdienst", mode: "insensitive" }, datum: { gte: new Date(nu.getFullYear(), 0, 1) } }, select: { bedrag: true, datum: true, omschrijving: true } }),
  ]);
  // Betalingen aan de Belastingdienst: btw van het vorige tijdvak, en termijnen inkomstenbelasting (voorlopige aanslag).
  const isIb = (t: { omschrijving: string }) => /inkomstenbelasting|aanslag|\bib\b/i.test(t.omschrijving) && !/omzetbelasting|btw/i.test(t.omschrijving);
  const ibBetaald = fiscus.filter(isIb).reduce((s, t) => s + Math.abs(t.bedrag), 0);
  const vorigeBetaald = fiscus.some((t) => !isIb(t) && t.datum >= vorigeEinde);

  let banksaldo: number | null = null;
  if (rekeningen.length > 0) banksaldo = rekeningen.reduce((s, r) => s + (r.saldo ?? mutaties.find((m) => m.bankrekeningId === r.id)?._sum.bedrag ?? 0), 0);
  else { const los = mutaties.find((m) => m.bankrekeningId === null)?._sum.bedrag; if (los != null) banksaldo = los; }

  const btwNu = Math.max(0, btwAangifte(nuRegels)["5c_te_betalen"]);
  const btwVorig = vorigeAangifte?.status === "betaald" || vorigeBetaald ? 0 : Math.max(0, btwAangifte(vorigeRegels)["5c_te_betalen"]);
  const btwTeBetalen = rond(btwNu + btwVorig);
  const ibOpzij = rond(Math.max(0, ib.ib.teBetalen - ibBetaald));
  const vrij = banksaldo == null ? null : rond(banksaldo - btwTeBetalen - ibOpzij);
  const priveGemiddeld = rond(Math.abs(prive._sum.bedrag ?? 0) / 3);
  const vasteLastenPerMaand = rond(lasten.reduce((s, l) => s + l.perMaand, 0));
  const teOntvangen = rond(open.reduce((s, f) => s + Math.max(0, f.totaal - f.betaaldBedrag), 0));

  // Vooruitblik per dag: vrij te besteden, plus wat klanten nog betalen, min vaste lasten en je gemiddelde privé-uitgaven.
  let reiktTot: Date | null = null;
  if (vrij != null) {
    let stand = vrij;
    const komend = lasten.map((l) => ({ ...l, d: new Date(l.volgende) }));
    const binnen = open.map((f) => ({ d: f.vervaldatum < nu ? new Date(nu.getTime() + 7 * 864e5) : f.vervaldatum, bedrag: Math.max(0, f.totaal - f.betaaldBedrag) }));
    for (let i = 0; i <= 366; i++) {
      const dag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + i);
      const morgen = new Date(dag.getTime() + 864e5);
      for (const b of binnen) if (b.d >= dag && b.d < morgen) stand += b.bedrag;
      for (const l of komend) while (l.d >= dag && l.d < morgen) { stand -= l.bedrag; l.d = new Date(l.d.getFullYear(), l.d.getMonth() + 1, l.d.getDate()); }
      stand -= priveGemiddeld / 30.4;
      if (stand < 0) { reiktTot = dag; break; }
    }
  }

  return {
    banksaldo: banksaldo == null ? null : rond(banksaldo),
    btwTeBetalen,
    btwDeadline: btwDeadline(vorigeAangifte?.status === "betaald" || btwVorig === 0 ? huidig.eind : vorigeEinde),
    ibOpzij,
    ibBetaald: rond(ibBetaald),
    vrij,
    vasteLasten: lasten,
    vasteLastenPerMaand,
    priveGemiddeld,
    teOntvangen,
    reiktTot,
    krap: Boolean(reiktTot && reiktTot.getTime() - nu.getTime() < 31 * 864e5),
    reiktTekst: !reiktTot
      ? `na ${new Date(nu.getFullYear() + 1, nu.getMonth(), 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}`
      : vrij != null && vrij < 0 ? "nu al te krap" : reiktTot.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }),
    potjePerMaand: { btw: rond(Math.max(0, ib.btwJaar["5c_te_betalen"]) / ib.maanden), ib: Math.max(0, Math.round((ib.ibJaar.teBetalen - ibBetaald) / Math.max(1, 12 - nu.getMonth()))) },
  };
}

/** Maand voor maand: winst van die maand en de verwachte inkomstenbelasting over het hele jaar met de cijfers tot dan. */
export async function ibPerMaand(o: Onderneming, jaar = new Date().getFullYear()) {
  const nu = new Date();
  const maanden = jaar === nu.getFullYear() ? nu.getMonth() + 1 : 12;
  const uit: { maand: string; winst: number; verwachtJaar: number }[] = [];
  let vorige = 0;
  for (let m = 0; m < maanden; m++) {
    const wv = await winstVerlies(o.id, new Date(jaar, 0, 1), new Date(jaar, m + 1, 1));
    const verwachteWinst = Math.round((wv.fiscaleWinst / (m + 1)) * 12);
    const ib = berekenIb({ fiscaleWinst: verwachteWinst, uren: o.urencriterium ? 1225 : 0, urenCriteriumGehaald: o.urencriterium ? true : undefined, starter: o.starter, investeringen: 0, kilometerVergoeding: 0 });
    uit.push({ maand: new Date(jaar, m, 1).toLocaleDateString("nl-NL", { month: "long" }), winst: rond(wv.fiscaleWinst - vorige), verwachtJaar: Math.round(ib.teBetalen) });
    vorige = wv.fiscaleWinst;
  }
  return uit;
}
