import { db } from "@/lib/db";
import { btwUitInclusief, rond } from "@/lib/btw";
import { CATEGORIE_INFO, type Categorie } from "@/lib/categorieen";
import { factuurRegels } from "@/lib/btw-bron";

export type WinstRegel = {
  categorie: string;
  label: string;
  rgs: string;
  soort: string;
  bruto: number;      // ex btw, zakelijk deel
  aftrekbaar: number; // bruto × aftrek
  aantal: number;
};

export type WinstVerlies = {
  periode: { start: Date; eind: Date };
  omzet: number;
  kosten: number;
  kostenAftrekbaar: number;
  afschrijving: number;
  winst: number;           // omzet - kosten (bedrijfseconomisch)
  fiscaleWinst: number;    // omzet - aftrekbare kosten
  omzetRegels: WinstRegel[];
  kostenRegels: WinstRegel[];
};

function info(c: string | null | undefined) {
  if (c && c in CATEGORIE_INFO) return { key: c, ...CATEGORIE_INFO[c as Categorie] };
  return { key: c ?? "overig", label: c ?? "Overig", rgs: "WBedOvpOvp", soort: "kosten" as const, aftrek: 1 };
}

/**
 * Winst-en-verliesrekening over een periode.
 * Bron: bevestigde én onbevestigde AI-boekingen (zakelijk = true), geïmporteerde boekingsregels, memoriaal (incl. afschrijving).
 * Bedragen ex btw. Privédeel van gemengde kosten wordt eruit gehaald.
 */
export async function winstVerlies(ondernemingId: string, start: Date, eind: Date): Promise<WinstVerlies> {
  const [transacties, boekingen, memoriaal] = await Promise.all([
    db.transactie.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind }, zakelijk: true } }),
    db.boekingsregel.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } } }),
    db.memoriaalboeking.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } } }),
  ]);

  const per = new Map<string, WinstRegel>();
  const tel = (cat: string, exBtw: number) => {
    const i = info(cat);
    if (i.soort === "balans" || i.soort === "prive" || i.soort === "activa" || i.soort === "prive_aftrek") return;
    const r = per.get(i.key) ?? { categorie: i.key, label: i.label, rgs: i.rgs, soort: i.soort, bruto: 0, aftrekbaar: 0, aantal: 0 };
    r.bruto += exBtw;
    r.aftrekbaar += exBtw * (i.soort === "omzet" ? 1 : i.aftrek);
    r.aantal++;
    per.set(i.key, r);
  };

  // Factuurstelsel (standaard): omzet uit de facturen op factuurdatum; betalingen die aan een factuur hangen tellen niet nog eens.
  const stelsel = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { btwStelsel: true } });
  const opFactuur = stelsel?.btwStelsel !== "kas";
  const bankRegels = opFactuur ? transacties.filter((t) => !t.factuurId) : transacties;
  const uitFacturen = opFactuur ? await factuurRegels(ondernemingId, start, eind) : [];
  for (const t of [...bankRegels, ...uitFacturen]) {
    const zakelijk = 1 - (t.priveDeel ?? 0);
    const incl = Math.abs(t.bedrag);
    const btw = t.btwBedrag ?? btwUitInclusief(incl, t.btwCode);
    const ex = (incl - btw) * zakelijk;
    const i = info(t.categorie);
    // Terugbetaling aan klant of creditering: negatief bij omzet
    const teken = t.bedrag >= 0 ? 1 : -1;
    if (i.soort === "omzet") tel(i.key, teken * ex);
    else tel(i.key, -teken * ex);
  }
  for (const b of boekingen) {
    const i = info(b.categorie);
    const ex = Math.abs(b.bedrag) - Math.abs(b.btwBedrag);
    if (i.soort === "omzet") tel(i.key, b.bedrag >= 0 ? ex : -ex);
    else tel(i.key, ex);
  }
  for (const m of memoriaal) {
    const i = info(m.categorie);
    const ex = Math.abs(m.bedrag) - Math.abs(m.btwBedrag);
    if (i.soort === "omzet") tel(i.key, m.bedrag >= 0 ? ex : -ex);
    else tel(i.key, ex);
  }

  const regels = [...per.values()].map((r) => ({ ...r, bruto: rond(r.bruto), aftrekbaar: rond(r.aftrekbaar) }));
  const omzetRegels = regels.filter((r) => r.soort === "omzet").sort((a, b) => b.bruto - a.bruto);
  const kostenRegels = regels.filter((r) => r.soort !== "omzet").sort((a, b) => b.bruto - a.bruto);
  const omzet = rond(omzetRegels.reduce((s, r) => s + r.bruto, 0));
  const kosten = rond(kostenRegels.reduce((s, r) => s + r.bruto, 0));
  const kostenAftrekbaar = rond(kostenRegels.reduce((s, r) => s + r.aftrekbaar, 0));
  const afschrijving = rond(kostenRegels.filter((r) => r.categorie === "afschrijving").reduce((s, r) => s + r.bruto, 0));
  return {
    periode: { start, eind },
    omzet,
    kosten,
    kostenAftrekbaar,
    afschrijving,
    winst: rond(omzet - kosten),
    fiscaleWinst: rond(omzet - kostenAftrekbaar),
    omzetRegels,
    kostenRegels,
  };
}

/** Omzet per maand voor grafieken en KOR-check. */
export async function omzetPerMaand(ondernemingId: string, jaar: number) {
  const wv = await winstVerlies(ondernemingId, new Date(jaar, 0, 1), new Date(jaar + 1, 0, 1));
  const transacties = await db.transactie.findMany({
    where: { ondernemingId, zakelijk: true, bedrag: { gt: 0 }, datum: { gte: new Date(jaar, 0, 1), lt: new Date(jaar + 1, 0, 1) } },
    select: { datum: true, bedrag: true, btwBedrag: true, btwCode: true, categorie: true, priveDeel: true },
  });
  const maanden = Array.from({ length: 12 }, () => 0);
  for (const t of transacties) {
    const i = info(t.categorie);
    if (i.soort !== "omzet") continue;
    const ex = t.bedrag - (t.btwBedrag ?? btwUitInclusief(t.bedrag, t.btwCode));
    maanden[t.datum.getMonth()] += ex;
  }
  return { totaal: wv.omzet, maanden: maanden.map(rond) };
}
