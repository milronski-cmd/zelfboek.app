import { db } from "@/lib/db";
import { btwAangifte, rond, periodeBereik } from "@/lib/btw";
import { boekwaarde } from "./afschrijving";
import { winstVerlies, type WinstVerlies } from "./winst";

export type BalansPost = { label: string; rgs: string; bedrag: number };

export type Jaarrekening = {
  jaar: number;
  wv: WinstVerlies;
  activa: BalansPost[];
  passiva: BalansPost[];
  totaalActiva: number;
  totaalPassiva: number;
  eigenVermogen: number;
  kengetallen: { label: string; waarde: string; uitleg: string }[];
};

/**
 * Balans per 31 december en W&V over het jaar.
 * Bank: som van alle zakelijke mutaties t/m jaareinde (startsaldo onbekend, dus mutatiesaldo) of Bankrekening.saldo als die er is.
 * Debiteuren: open facturen. Activa: boekwaarde. Btw-schuld: 5c van het laatste tijdvak nog niet betaald.
 * Eigen vermogen = sluitpost.
 */
export async function jaarrekening(ondernemingId: string, jaar: number): Promise<Jaarrekening> {
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const peil = new Date(jaar, 11, 31, 23, 59, 59);
  const onderneming = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId }, select: { btwTijdvak: true } });
  // Laatste btw-tijdvak van het jaar: december, Q4 of het hele jaar.
  const laatstePeriode = onderneming.btwTijdvak === "maand" ? 12 : onderneming.btwTijdvak === "jaar" ? 0 : 4;
  const laatsteTijdvak = periodeBereik(onderneming.btwTijdvak, jaar, laatstePeriode);
  const lopendJaar = jaar === new Date().getFullYear();

  const [wv, rekeningen, mutaties, openFacturen, activa, btwRegels, aangiften, prive] = await Promise.all([
    winstVerlies(ondernemingId, start, eind),
    db.bankrekening.findMany({ where: { ondernemingId } }),
    db.transactie.groupBy({ by: ["bankrekeningId"], where: { ondernemingId, datum: { lt: eind } }, _sum: { bedrag: true } }),
    // Debiteuren per 31-12: verzonden vóór jaareinde en toen nog niet (volledig) betaald, ook als ze inmiddels wel betaald zijn.
    db.factuur.findMany({ where: { ondernemingId, soort: "factuur", datum: { lt: eind }, status: { notIn: ["concept", "gecrediteerd"] }, OR: [{ betaaldOp: null }, { betaaldOp: { gte: eind } }] } }),
    db.activum.findMany({ where: { ondernemingId, aanschafDatum: { lt: eind } } }),
    db.transactie.findMany({ where: { ondernemingId, datum: { gte: laatsteTijdvak.start, lt: laatsteTijdvak.eind } }, select: { bedrag: true, btwCode: true, btwBedrag: true, zakelijk: true, categorie: true, priveDeel: true } }),
    db.aangifte.findMany({ where: { ondernemingId, soort: "btw", jaar } }),
    db.transactie.aggregate({ where: { ondernemingId, datum: { gte: start, lt: eind }, categorie: "prive" }, _sum: { bedrag: true } }),
  ]);

  const activaPosten: BalansPost[] = [];
  const passivaPosten: BalansPost[] = [];

  let bankTotaal = 0;
  for (const r of rekeningen) {
    const mut = mutaties.find((m) => m.bankrekeningId === r.id)?._sum.bedrag ?? 0;
    // Het live banksaldo geldt alleen voor het lopende jaar; voor een oud boekjaar telt het mutatiesaldo t/m 31-12.
    const saldo = lopendJaar && r.saldo != null ? r.saldo : mut;
    bankTotaal += saldo;
    activaPosten.push({ label: `Bank ${r.naam}`, rgs: "BLimBanRba", bedrag: rond(saldo) });
  }
  const losseMutaties = mutaties.find((m) => m.bankrekeningId === null)?._sum.bedrag ?? 0;
  if (rekeningen.length === 0 || losseMutaties !== 0) {
    bankTotaal += losseMutaties;
    activaPosten.push({ label: "Bank (mutatiesaldo)", rgs: "BLimBanRba", bedrag: rond(losseMutaties) });
  }

  const debiteuren = rond(openFacturen.reduce((s, f) => s + (f.betaaldOp && f.betaaldOp >= eind ? f.totaal : f.totaal - f.betaaldBedrag), 0));
  if (debiteuren) activaPosten.push({ label: "Debiteuren (open facturen)", rgs: "BVorDebHad", bedrag: debiteuren });

  let activaBoekwaarde = 0;
  for (const a of activa) {
    if (a.verkochtOp && a.verkochtOp < eind) continue;
    activaBoekwaarde += boekwaarde(a, peil).boekwaarde;
  }
  if (activaBoekwaarde) activaPosten.push({ label: "Materiële vaste activa (boekwaarde)", rgs: "BMvaBeiVvp", bedrag: rond(activaBoekwaarde) });

  // Btw-schuld: laatste kwartaal als die nog niet betaald is
  const q4 = btwAangifte(btwRegels);
  const q4Betaald = aangiften.some((a) => a.periode === laatstePeriode && a.status === "betaald");
  const btwSchuld = q4Betaald ? 0 : q4["5c_te_betalen"];
  if (btwSchuld > 0) passivaPosten.push({ label: "Te betalen omzetbelasting", rgs: "BSchBepBtw", bedrag: rond(btwSchuld) });
  else if (btwSchuld < 0) activaPosten.push({ label: "Te vorderen omzetbelasting", rgs: "BVorVbkTvo", bedrag: rond(-btwSchuld) });

  const totaalActiva = rond(activaPosten.reduce((s, p) => s + p.bedrag, 0));
  const schulden = rond(passivaPosten.reduce((s, p) => s + p.bedrag, 0));
  const eigenVermogen = rond(totaalActiva - schulden);
  passivaPosten.unshift({ label: "Ondernemingsvermogen", rgs: "BEivKapOnd", bedrag: eigenVermogen });

  const priveOpnamen = rond(-(prive._sum.bedrag ?? 0));
  const marge = wv.omzet > 0 ? wv.winst / wv.omzet : 0;
  const kengetallen = [
    { label: "Brutomarge", waarde: `${(marge * 100).toFixed(1).replace(".", ",")}%`, uitleg: "Winst gedeeld door omzet." },
    { label: "Privéopnamen", waarde: `€ ${Math.round(priveOpnamen).toLocaleString("nl-NL")}`, uitleg: "Wat je dit jaar als privé hebt aangemerkt." },
    { label: "Liquiditeit", waarde: `€ ${Math.round(bankTotaal).toLocaleString("nl-NL")}`, uitleg: "Banksaldo einde jaar." },
    { label: "Solvabiliteit", waarde: totaalActiva > 0 ? `${((eigenVermogen / totaalActiva) * 100).toFixed(0)}%` : "–", uitleg: "Eigen vermogen gedeeld door balanstotaal." },
  ];

  return {
    jaar,
    wv,
    activa: activaPosten,
    passiva: passivaPosten,
    totaalActiva,
    totaalPassiva: rond(schulden + eigenVermogen),
    eigenVermogen,
    kengetallen,
  };
}
