import { db } from "./db";
import { btwAangifte, type Aangifte } from "./btw";
import { berekenTotalen, EU, isVerlegd, parseRegels } from "./facturen/bereken";

/**
 * De regels waar de btw-aangifte op rust, op één plek (alle schermen, exports, indienen en meldingen gebruiken dit).
 *
 * - KOR: geen btw-aangifte, dus niets.
 * - Factuurstelsel (standaard in Nederland): omzet telt op de factuurdatum, uit de facturen zelf. Betalingen die aan
 *   een factuur zijn gekoppeld tellen dan niet nog eens. Overige ontvangsten (webshop, kassa) tellen als omzet op de bankdatum.
 * - Kasstelsel (alleen met toestemming van de Belastingdienst): omzet telt als het geld binnenkomt.
 * Kosten en voorbelasting komen altijd uit de bank (op de betaaldatum, met de factuur/bon als bewijs).
 */
export type BtwRegel = { bedrag: number; btwCode: string | null; btwBedrag: number | null; zakelijk: boolean | null; categorie: string | null; priveDeel: number };

export async function btwRegels(ondernemingId: string, start: Date, eind: Date): Promise<BtwRegel[]> {
  const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { korDeelnemer: true, btwStelsel: true } });
  if (!o || o.korDeelnemer) return [];
  const transacties = await db.transactie.findMany({
    where: { ondernemingId, datum: { gte: start, lt: eind } },
    select: { bedrag: true, btwCode: true, btwBedrag: true, zakelijk: true, categorie: true, priveDeel: true, factuurId: true },
  });
  if (o.btwStelsel === "kas") return transacties;
  const uitBank = transacties.filter((t) => !t.factuurId);
  return [...uitBank, ...(await factuurRegels(ondernemingId, start, eind))];
}

/** Verkoopfacturen (en creditfacturen) in de periode als btw-regels, per tarief. */
export async function factuurRegels(ondernemingId: string, start: Date, eind: Date): Promise<BtwRegel[]> {
  const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { korDeelnemer: true } });
  const facturen = await db.factuur.findMany({
    // Een creditfactuur telt meteen (de oorspronkelijke factuur staat dan al op gecrediteerd), ook als hij nog niet verstuurd is.
    where: { ondernemingId, datum: { gte: start, lt: eind }, OR: [{ status: { not: "concept" } }, { soort: "credit" }] },
    include: { klant: { select: { land: true, btwNummer: true, isOndernemer: true } } },
  });
  const uit: BtwRegel[] = [];
  for (const f of facturen) {
    const t = berekenTotalen(parseRegels(f.regels), f.klant, o);
    const land = (f.klant.land ?? "NL").toUpperCase();
    if (t.btwVerlegd || isVerlegd(f.klant)) {
      // Verlegd: binnen de EU naar 3b (ICP), buiten de EU naar 3a.
      uit.push({ bedrag: t.subtotaal, btwCode: EU.has(land) ? "eu_dienst" : "buiten_eu", btwBedrag: 0, zakelijk: true, categorie: EU.has(land) ? "omzet_eu" : "omzet_buiten_eu", priveDeel: 0 });
      continue;
    }
    for (const p of t.perTarief) {
      if (!p.grondslag && !p.btw) continue;
      uit.push({ bedrag: p.grondslag + p.btw, btwCode: p.tarief === 21 ? "21" : p.tarief === 9 ? "9" : "0", btwBedrag: Math.abs(p.btw), zakelijk: true, categorie: p.tarief === 9 ? "omzet_laag" : "omzet", priveDeel: 0 });
    }
  }
  return uit;
}

export async function aangifteVoor(ondernemingId: string, start: Date, eind: Date): Promise<Aangifte> {
  return btwAangifte(await btwRegels(ondernemingId, start, eind));
}
