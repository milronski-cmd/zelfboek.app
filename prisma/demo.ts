/**
 * Vult je lokale database met demo-gegevens voor één onderneming, zodat je de app met inhoud ziet.
 * Gebruik: npm run demo [e-mailadres]  (zonder adres: de eerste gebruiker)
 * Weigert op productie en op een database die niet lokaal draait.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Alleen voor een lokale database (DATABASE_URL moet naar localhost wijzen).");
  process.exit(1);
}

// Vaste pseudo-willekeur zodat de demo elke keer hetzelfde is.
let zaad = 7;
const rnd = () => { zaad = (zaad * 9301 + 49297) % 233280; return zaad / 233280; };
const kies = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const bedrag2 = (n: number) => Math.round(n * 100) / 100;

const KOSTEN: { naam: string; omschrijving: string; cat: string; btw: string; min: number; max: number; uitleg: string }[] = [
  { naam: "Google Ireland", omschrijving: "Google Workspace", cat: "software", btw: "verlegd", min: 14, max: 14, uitleg: "Vast softwareabonnement, btw verlegd (EU-dienst)." },
  { naam: "Adobe Systems", omschrijving: "Creative Cloud", cat: "software", btw: "verlegd", min: 65, max: 65, uitleg: "Maandabonnement ontwerpsoftware." },
  { naam: "KPN", omschrijving: "Zakelijk internet en mobiel", cat: "telefoon_internet", btw: "21", min: 58, max: 62, uitleg: "Vaste zakelijke telecomkosten." },
  { naam: "NS Zakelijk", omschrijving: "Treinreizen", cat: "reiskosten", btw: "9", min: 18, max: 95, uitleg: "Reiskosten OV, laag tarief." },
  { naam: "Coolblue", omschrijving: "Toetsenbord en monitorarm", cat: "apparatuur", btw: "21", min: 89, max: 420, uitleg: "Apparatuur onder € 450, direct als kosten." },
  { naam: "Albert Heijn", omschrijving: "Boodschappen", cat: "representatie", btw: "9", min: 12, max: 48, uitleg: "Kan privé zijn: geen zakelijk kenmerk in de omschrijving." },
  { naam: "Cafe Het Hoekje", omschrijving: "Lunch", cat: "representatie", btw: "9", min: 14, max: 42, uitleg: "Kan privé zijn: geen zakelijk kenmerk in de omschrijving." },
  { naam: "Shell", omschrijving: "Brandstof", cat: "auto", btw: "21", min: 45, max: 90, uitleg: "Brandstof, zakelijke rit volgens kilometerregistratie." },
  { naam: "Q-Park", omschrijving: "Parkeren", cat: "parkeren", btw: "21", min: 4, max: 22, uitleg: "Parkeerkosten bij klantbezoek." },
  { naam: "Meta Platforms", omschrijving: "Advertenties", cat: "marketing", btw: "verlegd", min: 50, max: 250, uitleg: "Advertentiekosten, btw verlegd." },
  { naam: "ABN AMRO", omschrijving: "Kosten zakelijke rekening", cat: "bankkosten", btw: "geen", min: 9.95, max: 9.95, uitleg: "Bankkosten, vrijgesteld van btw." },
  { naam: "Interpolis", omschrijving: "Beroepsaansprakelijkheid", cat: "verzekering", btw: "geen", min: 31.5, max: 31.5, uitleg: "Zakelijke verzekering, vrijgesteld." },
  { naam: "Bol.com", omschrijving: "Vakliteratuur", cat: "opleiding", btw: "9", min: 24, max: 60, uitleg: "Vakboek, laag tarief." },
];
const KLANTEN = [
  { naam: "Bakkerij De Korst", contactpersoon: "Marieke de Korst", email: "info@bakkerijdekorst.nl", plaats: "Groningen" },
  { naam: "Fysio Centrum Zuid", contactpersoon: "Ruben Visser", email: "administratie@fysiozuid.nl", plaats: "Haren" },
  { naam: "Studio Lente", contactpersoon: "Anne Smit", email: "anne@studiolente.nl", plaats: "Assen" },
  { naam: "Vereniging Dorpshuis", contactpersoon: "Hans Bakker", email: "penningmeester@dorpshuis.nl", plaats: "Zuidlaren" },
  { naam: "Weber GmbH", contactpersoon: "Katrin Weber", email: "katrin@weber-design.de", plaats: "Bremen", land: "DE", btwNummer: "DE812345678" },
];

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const gebruiker = email ? await db.gebruiker.findUnique({ where: { email } }) : await db.gebruiker.findFirst({ orderBy: { aangemaakt: "asc" } });
  if (!gebruiker) throw new Error("Geen gebruiker gevonden. Log eerst één keer in.");
  const lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: gebruiker.id } });
  if (!lid) throw new Error("Gebruiker heeft geen onderneming.");
  const oid = lid.ondernemingId;

  // Schoon: alles van deze onderneming weg, behalve leden en koppelingen.
  await db.transactie.deleteMany({ where: { ondernemingId: oid } });
  await db.bon.deleteMany({ where: { ondernemingId: oid } });
  await db.factuur.deleteMany({ where: { ondernemingId: oid } });
  await db.offerte.deleteMany({ where: { ondernemingId: oid } });
  await db.urenregel.deleteMany({ where: { ondernemingId: oid } });
  await db.kilometerregel.deleteMany({ where: { ondernemingId: oid } });
  await db.klant.deleteMany({ where: { ondernemingId: oid } });
  await db.bankrekening.deleteMany({ where: { ondernemingId: oid } });
  await db.taak.deleteMany({ where: { ondernemingId: oid } });
  await db.melding.deleteMany({ where: { ondernemingId: oid } });

  await db.onderneming.update({
    where: { id: oid },
    data: { naam: "Studio Noord", branche: "webdesign en huisstijl", kvk: "87654321", btwId: "NL003456789B01", btwNummer: "123456789B01", iban: "NL69INGB0001234567", adres: "Oude Kijk in 't Jatstraat 12", postcode: "9712 EH", plaats: "Groningen", email: "hallo@studionoord.nl", startdatum: new Date(2023, 2, 1), abonnement: "proef", proefTot: new Date(Date.now() + 30 * 864e5) },
  });

  const nu = new Date();
  const ing = await db.bankrekening.create({ data: { ondernemingId: oid, naam: "ING Zakelijk", iban: "NL69INGB0001234567", bank: "ING", bron: "psd2", psd2AccountId: "demo-ing", psd2Verloopt: new Date(nu.getTime() + 80 * 864e5), laatsteSync: nu, saldo: 8432.17 } });
  const revolut = await db.bankrekening.create({ data: { ondernemingId: oid, naam: "Revolut Business", iban: "NL39REVO0012345678", bank: "Revolut", bron: "psd2", psd2AccountId: "demo-revolut", psd2Verloopt: new Date(nu.getTime() + 62 * 864e5), laatsteSync: nu, saldo: 2140.55 } });
  const rek = ing;
  // Buitenlandse software en de Duitse klant lopen via Revolut, de rest via ING.
  const IBANS: Record<string, string> = { "Bakkerij De Korst": "NL11RABO0163331561", "Fysio Centrum Zuid": "NL91ABNA0846847140", "Studio Lente": "NL27INGB0109741897", "Vereniging Dorpshuis": "NL45TRIO0212345678", "Weber GmbH": "DE89370400440532013000", "KPN": "NL10INGB0000000421", "Coolblue": "NL86INGB0002445588", "Belastingdienst": "NL86INGB0002445588" };
  const klanten = await Promise.all(KLANTEN.map((k) => db.klant.create({ data: { ondernemingId: oid, ...k } })));

  // Twaalf maanden bankregels: per maand twee of drie ontvangsten, zes tot negen kosten.
  const regels: Parameters<typeof db.transactie.create>[0]["data"][] = [];
  let nr = 0;
  for (let m = 11; m >= 0; m--) {
    const jaar = nu.getFullYear(), maand = nu.getMonth() - m;
    const laatsteMaand = m === 0;
    const aantalIn = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < aantalIn; i++) {
      const k = kies(klanten);
      const excl = bedrag2(850 + rnd() * 2400);
      const eu = k.land === "DE";
      const btw = eu ? 0 : bedrag2(excl * 0.21);
      regels.push({ ondernemingId: oid, bankrekeningId: eu ? revolut.id : ing.id, tegenIban: IBANS[k.naam], datum: new Date(jaar, maand, 3 + Math.floor(rnd() * 20)), bedrag: bedrag2(excl + btw), tegenpartij: k.naam, omschrijving: `Factuur ${jaar}-${String(++nr).padStart(4, "0")}`, hash: `demo-in-${m}-${i}`, bron: "csv", categorie: eu ? "omzet_eu" : "omzet", btwCode: eu ? "eu_dienst" : "21", btwBedrag: btw, zakelijk: true, zekerheid: 0.98, uitleg: "Betaling van een klant op een verzonden factuur.", bevestigd: true });
    }
    const aantalUit = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < aantalUit; i++) {
      const k = kies(KOSTEN);
      const bedrag = bedrag2(k.min + rnd() * (k.max - k.min));
      const btwCode = k.btw as string;
      const btw = btwCode === "21" ? bedrag2(bedrag - bedrag / 1.21) : btwCode === "9" ? bedrag2(bedrag - bedrag / 1.09) : 0;
      const twijfel = laatsteMaand && k.cat === "representatie";
      regels.push({ ondernemingId: oid, bankrekeningId: btwCode === "verlegd" ? revolut.id : ing.id, tegenIban: IBANS[k.naam], datum: new Date(jaar, maand, 1 + Math.floor(rnd() * 27)), bedrag: -bedrag, tegenpartij: k.naam, omschrijving: `${k.omschrijving} ${jaar}`, hash: `demo-uit-${m}-${i}`, bron: "csv", categorie: k.cat, btwCode, btwBedrag: btw, zakelijk: true, zekerheid: twijfel ? bedrag2(0.52 + rnd() * 0.3) : 0.96, uitleg: k.uitleg, bevestigd: !twijfel });
    }
  }
  // Privé en nog niet beoordeeld.
  regels.push({ ondernemingId: oid, bankrekeningId: rek.id, datum: new Date(nu.getFullYear(), nu.getMonth(), 2), bedrag: -1250, tegenpartij: "D. Jansen", omschrijving: "Privéopname", hash: "demo-prive-1", bron: "csv", categorie: "prive", btwCode: "geen", zakelijk: false, zekerheid: 0.99, uitleg: "Overboeking naar eigen privérekening.", bevestigd: true });
  regels.push({ ondernemingId: oid, bankrekeningId: rek.id, datum: new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()), bedrag: -37.8, tegenpartij: "Tinkerlabs BV", omschrijving: "Order 48213", hash: "demo-open-1", bron: "csv", zakelijk: null, bevestigd: false });
  regels.push({ ondernemingId: oid, bankrekeningId: rek.id, datum: new Date(nu.getFullYear(), nu.getMonth() - 1, 28), bedrag: -1860, tegenpartij: "Belastingdienst", omschrijving: "Omzetbelasting", hash: "demo-btw-1", bron: "csv", categorie: "belasting", btwCode: "geen", zakelijk: true, zekerheid: 0.99, uitleg: "Betaalde btw-aangifte vorig kwartaal.", bevestigd: true });
  // Een paar regels die alleen op Revolut voorkomen.
  regels.push({ ondernemingId: oid, bankrekeningId: revolut.id, datum: new Date(nu.getFullYear(), nu.getMonth(), 1), bedrag: -15, tegenpartij: "Figma", omschrijving: "Figma Professional", hash: "demo-revo-1", bron: "csv", categorie: "software", btwCode: "verlegd", btwBedrag: 0, zakelijk: true, zekerheid: 0.97, uitleg: "Ontwerpsoftware, btw verlegd.", bevestigd: true });
  regels.push({ ondernemingId: oid, bankrekeningId: revolut.id, datum: new Date(nu.getFullYear(), nu.getMonth(), 1), bedrag: -25, tegenpartij: "Revolut", omschrijving: "Business plan Grow", hash: "demo-revo-2", bron: "csv", categorie: "bankkosten", btwCode: "geen", btwBedrag: 0, zakelijk: true, zekerheid: 0.99, uitleg: "Abonnement zakelijke rekening, vrijgesteld.", bevestigd: true });
  regels.push({ ondernemingId: oid, bankrekeningId: revolut.id, datum: new Date(nu.getFullYear(), nu.getMonth(), 5), bedrag: 2000, tegenpartij: "Studio Noord", tegenIban: "NL69INGB0001234567", omschrijving: "Overboeking eigen rekening", hash: "demo-revo-3", bron: "csv", categorie: "overboeking_eigen", btwCode: "geen", btwBedrag: 0, zakelijk: true, zekerheid: 0.99, uitleg: "Overboeking tussen eigen rekeningen.", bevestigd: true });
  for (const r of regels) await db.transactie.create({ data: r });

  // Facturen: betaald, open, te laat, concept.
  const factuur = (klant: (typeof klanten)[number], nummer: string, dagenGeleden: number, status: string, excl: number, extra: Record<string, unknown> = {}) => {
    const eu = klant.land === "DE";
    const btw = eu ? 0 : bedrag2(excl * 0.21);
    const datum = new Date(nu.getTime() - dagenGeleden * 864e5);
    return db.factuur.create({ data: { ondernemingId: oid, klantId: klant.id, nummer, datum, vervaldatum: new Date(datum.getTime() + 14 * 864e5), regels: JSON.stringify([{ omschrijving: "Ontwerp en bouw website", aantal: 1, prijs: excl, btw: eu ? 0 : 21 }]), subtotaal: excl, btw, totaal: bedrag2(excl + btw), btwVerlegd: eu, status, verzondenOp: status === "concept" ? null : datum, ...(status === "betaald" ? { betaaldOp: new Date(datum.getTime() + 9 * 864e5), betaaldBedrag: bedrag2(excl + btw) } : {}), ...extra } });
  };
  await factuur(klanten[2], "2026-0028", 60, "betaald", 2400);
  await factuur(klanten[1], "2026-0029", 45, "betaald", 1500);
  await factuur(klanten[4], "2026-0030", 30, "betaald", 3200);
  await factuur(klanten[0], "2026-0031", 21, "herinnerd", 2250, { herinneringen: 1, laatsteHerinnering: new Date(nu.getTime() - 3 * 864e5) });
  await factuur(klanten[1], "2026-0032", 5, "verzonden", 1500);
  await factuur(klanten[3], "2026-0033", 2, "verzonden", 680);
  await factuur(klanten[2], "2026-0034", 0, "concept", 1950);
  await db.onderneming.update({ where: { id: oid }, data: { factuurVolgnr: 34, offerteVolgnr: 12 } });

  await db.offerte.create({ data: { ondernemingId: oid, klantId: klanten[3].id, nummer: "OFF-0011", datum: new Date(nu.getTime() - 8 * 864e5), geldigTot: new Date(nu.getTime() + 22 * 864e5), regels: JSON.stringify([{ omschrijving: "Nieuwe website dorpshuis", aantal: 1, prijs: 3800, btw: 21 }]), subtotaal: 3800, btw: 798, totaal: 4598, status: "verzonden", verzondenOp: new Date(nu.getTime() - 8 * 864e5) } });
  await db.offerte.create({ data: { ondernemingId: oid, klantId: klanten[0].id, nummer: "OFF-0012", datum: new Date(nu.getTime() - 1 * 864e5), geldigTot: new Date(nu.getTime() + 29 * 864e5), regels: JSON.stringify([{ omschrijving: "Huisstijl en drukwerk", aantal: 1, prijs: 1400, btw: 21 }]), subtotaal: 1400, btw: 294, totaal: 1694, status: "concept" } });

  // Bonnen: twee gekoppeld aan een bankregel, één nog los.
  const coolblue = await db.transactie.findFirst({ where: { ondernemingId: oid, tegenpartij: "Coolblue" }, orderBy: { datum: "desc" } });
  const shell = await db.transactie.findFirst({ where: { ondernemingId: oid, tegenpartij: "Shell" }, orderBy: { datum: "desc" } });
  const bon = (data: Record<string, unknown>) => db.bon.create({ data: { ondernemingId: oid, bestandsnaam: "bon.jpg", mimeType: "image/jpeg", bestandsPad: "uploads/demo/bon.jpg", zekerheid: 0.95, ...data } as never });
  if (coolblue) { const b = await bon({ leverancier: "Coolblue", factuurnummer: "CB-5583921", datum: coolblue.datum, totaal: Math.abs(coolblue.bedrag), btwBedrag: coolblue.btwBedrag, btwCode: "21", categorie: "apparatuur", status: "gekoppeld" }); await db.transactie.update({ where: { id: coolblue.id }, data: { bonId: b.id } }); }
  if (shell) { const b = await bon({ leverancier: "Shell", datum: shell.datum, totaal: Math.abs(shell.bedrag), btwBedrag: shell.btwBedrag, btwCode: "21", categorie: "auto", status: "gekoppeld" }); await db.transactie.update({ where: { id: shell.id }, data: { bonId: b.id } }); }
  await bon({ leverancier: "Praxis", factuurnummer: "0092-118877", datum: new Date(nu.getTime() - 4 * 864e5), totaal: 63.45, btwBedrag: 11.01, btwCode: "21", categorie: "kantoorkosten", status: "uitgelezen", uitleg: "Geen bankregel gevonden met dit bedrag in de buurt van deze datum." });

  // Uren en kilometers van de laatste weken.
  for (let d = 0; d < 40; d++) {
    const dag = new Date(nu.getTime() - d * 864e5);
    if (dag.getDay() === 0 || dag.getDay() === 6) continue;
    await db.urenregel.create({ data: { ondernemingId: oid, klantId: kies(klanten).id, datum: dag, uren: bedrag2(3 + rnd() * 5), omschrijving: kies(["Ontwerp homepage", "Bouw templates", "Overleg klant", "Content invoeren", "Testen en opleveren"]), soort: "declarabel", uurtarief: 85 } });
    if (rnd() < 0.25) await db.kilometerregel.create({ data: { ondernemingId: oid, datum: dag, van: "Groningen", naar: kies(["Haren", "Assen", "Zuidlaren"]), km: 18 + Math.floor(rnd() * 30), retour: true, doel: "Klantbezoek", vervoer: "prive_auto", vergoeding: 0 } });
  }

  await db.taak.create({ data: { ondernemingId: oid, titel: "Is de betaling van Cafe Het Hoekje (€ 42,50) zakelijk? Lunch met een klant?", bron: "ai" } });
  await db.taak.create({ data: { ondernemingId: oid, titel: "Btw-nummer van Weber GmbH controleren in VIES", deadline: new Date(nu.getTime() + 5 * 864e5), bron: "ai" } });
  await db.melding.create({ data: { ondernemingId: oid, soort: "herinnering", titel: "Factuur 2026-0031 is 7 dagen te laat", tekst: "Bakkerij De Korst heeft een eerste herinnering gekregen. Over 14 dagen volgt de tweede.", link: "/app/facturen" } });
  await db.melding.create({ data: { ondernemingId: oid, soort: "deadline", titel: "Btw-aangifte over dit kwartaal", tekst: "De aangifte staat klaar. Uiterlijk de laatste dag van de volgende maand indienen en betalen.", link: "/app/btw" } });
  await db.melding.create({ data: { ondernemingId: oid, soort: "sync", titel: "Bankbestand verwerkt", tekst: `${regels.length} regels geboekt.`, link: "/app/bank", gelezen: true } });

  console.log(`Klaar: ${regels.length} bankregels (ING en Revolut), 7 facturen, 2 offertes, 3 bonnen, ${klanten.length} klanten voor "Studio Noord" (${gebruiker.email}).`);
}

main().finally(() => db.$disconnect());
