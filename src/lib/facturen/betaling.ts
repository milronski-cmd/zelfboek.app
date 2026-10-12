import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { EU } from "./bereken";

/** Factuur (deels) betaald markeren. Zonder bedrag: volledig. */
export async function markeerBetaald(factuurId: string, ondernemingId: string, bedrag?: number, datum = new Date()) {
  const f = await db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId } });
  const nieuw = rond(bedrag == null ? f.totaal : f.betaaldBedrag + bedrag);
  const volledig = nieuw >= f.totaal - 0.01;
  await db.factuur.update({
    where: { id: f.id },
    data: { betaaldBedrag: nieuw, status: volledig ? "betaald" : f.status, betaaldOp: volledig ? datum : null },
  });
}

/** Afletteren: bankregel koppelen aan factuur, als omzet bevestigen, factuur (deels) betaald. */
export async function letterAf(transactieId: string, factuurId: string, ondernemingId: string, boekBetaling = true) {
  const [t, f] = await Promise.all([
    db.transactie.findFirstOrThrow({ where: { id: transactieId, ondernemingId } }),
    db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId }, include: { klant: { select: { land: true } } } }),
  ]);
  // Verlegd binnen de EU hoort in 3b, buiten de EU in 3a (niet in 1e).
  const buitenEu = !EU.has((f.klant.land ?? "NL").toUpperCase());
  const btwCode = f.btwVerlegd ? (buitenEu ? "buiten_eu" : "eu_dienst") : f.btw > 0 ? (rond(f.btw / Math.max(f.subtotaal, 0.01)) >= 0.2 ? "21" : "9") : "0";
  await db.transactie.update({
    where: { id: t.id },
    data: {
      factuurId: f.id,
      zakelijk: true,
      bevestigd: true,
      zekerheid: 1,
      categorie: f.btwVerlegd ? (buitenEu ? "omzet_buiten_eu" : "omzet_eu") : btwCode === "9" ? "omzet_laag" : "omzet",
      btwCode,
      btwBedrag: rond(Math.abs(t.bedrag) * (f.btw / Math.max(f.totaal, 0.01))),
      uitleg: `Afgeletterd met factuur ${f.nummer}`,
    },
  });
  if (boekBetaling) await markeerBetaald(f.id, ondernemingId, Math.abs(t.bedrag), t.datum);
}

/** Open factuurbedrag per klant. */
export async function openstaandPerKlant(ondernemingId: string) {
  const open = await db.factuur.findMany({
    where: { ondernemingId, status: { notIn: ["betaald", "concept", "oninbaar", "gecrediteerd"] }, soort: "factuur" },
    select: { klantId: true, totaal: true, betaaldBedrag: true },
  });
  const m = new Map<string, number>();
  for (const f of open) m.set(f.klantId, rond((m.get(f.klantId) ?? 0) + f.totaal - f.betaaldBedrag));
  return m;
}

const schoon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Binnengekomen betalingen automatisch aan open facturen koppelen (vóór de AI ernaar kijkt), zodat een betaalde
 * factuur niet twee keer als omzet telt en vanzelf op betaald gaat. Alleen bij een duidelijk verband:
 * het factuurnummer staat in de omschrijving, of het bedrag is precies het openstaande bedrag van één factuur
 * van een klant wiens naam in de tegenpartij staat.
 */
export async function letterAutomatischAf(ondernemingId: string): Promise<number> {
  const open = await db.factuur.findMany({
    where: {
      ondernemingId, soort: "factuur",
      OR: [
        { status: { in: ["verzonden", "herinnerd", "aangemaand"] } },
        // Met de hand op betaald gezet maar het geld is nog niet aan een bankregel gekoppeld
        { status: "betaald", transacties: { none: {} }, datum: { gte: new Date(Date.now() - 400 * 864e5) } },
      ],
    },
    include: { klant: { select: { naam: true } } },
  });
  if (open.length === 0) return 0;
  const binnen = await db.transactie.findMany({
    where: { ondernemingId, bedrag: { gt: 0 }, factuurId: null, bevestigd: false },
    orderBy: { datum: "asc" },
    take: 1000,
  });
  const rest = new Map(open.map((f) => [f.id, rond(f.status === "betaald" ? f.totaal : f.totaal - f.betaaldBedrag)]));
  let gekoppeld = 0;
  for (const t of binnen) {
    const tekst = schoon(`${t.omschrijving} ${t.tegenpartij}`);
    const tegen = schoon(t.tegenpartij);
    const kandidaten = open.filter((f) => (rest.get(f.id) ?? 0) > 0.009);
    let f = kandidaten.find((x) => schoon(x.nummer).length >= 4 && tekst.includes(schoon(x.nummer)) && t.bedrag <= (rest.get(x.id) ?? 0) + 0.01);
    if (!f) {
      const opBedrag = kandidaten.filter((x) => Math.abs((rest.get(x.id) ?? 0) - t.bedrag) < 0.01 && schoon(x.klant.naam).length >= 3
        && (tegen.includes(schoon(x.klant.naam)) || schoon(x.klant.naam).includes(tegen) && tegen.length >= 4));
      if (opBedrag.length === 1) f = opBedrag[0];
    }
    if (!f) continue;
    await letterAf(t.id, f.id, ondernemingId, f.status !== "betaald");
    rest.set(f.id, rond((rest.get(f.id) ?? 0) - t.bedrag));
    gekoppeld++;
  }
  return gekoppeld;
}
