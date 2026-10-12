/**
 * Kloppen de getallen? Handgemaakte scenario's met een met de hand uitgerekende uitkomst:
 * deelbetaling, creditfactuur, EU-dienst (in- en verkoop), verlegd, buiten de EU, gemengde kosten, KOR,
 * factuur- en kasstelsel, winst, inkomstenbelasting en "vrij te besteden".
 */
import { PrismaClient } from "@prisma/client";
import { aangifteVoor } from "../src/lib/btw-bron";
import { winstVerlies } from "../src/lib/fiscaal/winst";
import { berekenIb } from "../src/lib/fiscaal/ib";
import { ZELFSTANDIGENAFTREK, MKB_WINSTVRIJSTELLING } from "../src/lib/fiscaal/constanten-2026";
import { letterAutomatischAf } from "../src/lib/facturen/betaling";
import { berekenTotalen } from "../src/lib/facturen/bereken";
import { geldVooruit } from "../src/lib/geld";
import { periodeBereik } from "../src/lib/btw";

const db = new PrismaClient();
let fouten = 0;
function check(naam: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "ok " : "FOUT"} ${naam}${ok ? "" : " " + JSON.stringify(info)}`);
  if (!ok) fouten++;
}
const gelijk = (a: number, b: number) => Math.abs(a - b) < 0.011;
let h = 0;
const hash = () => `getallen-${Date.now()}-${h++}`;

async function factuur(oid: string, klantId: string, nummer: string, datum: Date, regels: { omschrijving: string; aantal: number; prijs: number; btw: number }[], extra: Record<string, unknown> = {}) {
  const klant = await db.klant.findUniqueOrThrow({ where: { id: klantId } });
  const t = berekenTotalen(regels, klant, { korDeelnemer: false });
  return db.factuur.create({ data: { ondernemingId: oid, klantId, nummer, datum, vervaldatum: new Date(datum.getTime() + 14 * 864e5), regels: JSON.stringify(regels), subtotaal: t.subtotaal, btw: t.btw, totaal: t.totaal, btwVerlegd: t.btwVerlegd, status: "verzonden", ...extra } });
}

async function main() {
  const o = await db.onderneming.create({ data: { naam: "Getallen Test", btwTijdvak: "kwartaal" } });
  const kor = await db.onderneming.create({ data: { naam: "KOR Test", korDeelnemer: true } });
  const vrijO = await db.onderneming.create({ data: { naam: "Vrij Test" } });
  try {
    const rek = await db.bankrekening.create({ data: { ondernemingId: o.id, naam: "Zakelijk", iban: "NL01TEST0000000099" } });
    const nl = await db.klant.create({ data: { ondernemingId: o.id, naam: "Bakkerij Jansen" } });
    const de = await db.klant.create({ data: { ondernemingId: o.id, naam: "Muster GmbH", land: "DE", btwNummer: "DE123456789" } });
    const us = await db.klant.create({ data: { ondernemingId: o.id, naam: "Acme Inc", land: "US" } });

    // Verkoop Q1 2026
    const f1 = await factuur(o.id, nl.id, "2026-0001", new Date(2026, 0, 15), [{ omschrijving: "Website", aantal: 1, prijs: 1000, btw: 21 }]); // 1210
    await factuur(o.id, de.id, "2026-0002", new Date(2026, 0, 20), [{ omschrijving: "Advies", aantal: 5, prijs: 100, btw: 21 }]); // verlegd 500
    await factuur(o.id, us.id, "2026-0003", new Date(2026, 1, 3), [{ omschrijving: "Design", aantal: 3, prijs: 100, btw: 21 }]); // buiten EU 300
    const f4 = await factuur(o.id, nl.id, "2026-0004", new Date(2026, 1, 10), [{ omschrijving: "Brood", aantal: 2, prijs: 100, btw: 9 }]); // 218
    // Creditfactuur op 2026-0004 (in maart, nog in concept: telt toch mee)
    await factuur(o.id, nl.id, "2026-0005", new Date(2026, 2, 5), [{ omschrijving: "Brood", aantal: -2, prijs: 100, btw: 9 }], { soort: "credit", status: "concept", gecrediteerdDoorId: f4.id });
    await db.factuur.update({ where: { id: f4.id }, data: { status: "gecrediteerd" } });
    check("factuur 1 totaal", f1.totaal === 1210, f1.totaal);

    const t = (datum: Date, bedrag: number, tegenpartij: string, omschrijving: string, extra: Record<string, unknown> = {}) =>
      ({ ondernemingId: o.id, bankrekeningId: rek.id, datum, bedrag, tegenpartij, omschrijving, hash: hash(), ...extra });
    await db.transactie.createMany({
      data: [
        // Deelbetaling van factuur 1: helft in februari (Q1), helft in april (Q2). Nog niet beoordeeld.
        t(new Date(2026, 1, 1), 605, "Bakkerij Jansen", "Betaling factuur 2026-0001 deel 1"),
        t(new Date(2026, 3, 1), 605, "BAKKERIJ JANSEN", "rest"),
        // Webshop-ontvangst zonder factuur
        t(new Date(2026, 1, 12), 242, "Mollie", "Uitbetaling webshop", { categorie: "omzet", btwCode: "21", btwBedrag: 42, zakelijk: true, bevestigd: true }),
        // Kosten
        t(new Date(2026, 0, 8), -1210, "Coolblue", "Monitor en toetsenbord", { categorie: "kantoorkosten", btwCode: "21", btwBedrag: 210, zakelijk: true, bevestigd: true }),
        t(new Date(2026, 0, 28), -121, "KPN", "Telefoon (half privé)", { categorie: "telefoon_internet", btwCode: "21", btwBedrag: 21, zakelijk: true, bevestigd: true, priveDeel: 0.5 }),
        t(new Date(2026, 1, 2), -100, "Google Ireland", "Google Ads", { categorie: "marketing", btwCode: "eu_dienst", btwBedrag: 0, zakelijk: true, bevestigd: true }),
        t(new Date(2026, 2, 1), -500, "Bouw BV", "Onderaanneming", { categorie: "inhuur", btwCode: "verlegd", btwBedrag: 0, zakelijk: true, bevestigd: true }),
        t(new Date(2026, 2, 3), -50, "Albert Heijn", "Boodschappen", { categorie: "prive", btwCode: "geen", btwBedrag: 0, zakelijk: false, bevestigd: true }),
      ],
    });

    // Automatisch afletteren: beide deelbetalingen horen bij factuur 1 (nummer in de omschrijving, en naam + restbedrag).
    const gekoppeld = await letterAutomatischAf(o.id);
    check("deelbetalingen gekoppeld", gekoppeld === 2, gekoppeld);
    const f1na = await db.factuur.findUniqueOrThrow({ where: { id: f1.id } });
    check("factuur 1 betaald na twee delen", f1na.status === "betaald" && gelijk(f1na.betaaldBedrag, 1210), f1na);
    const deel1 = await db.transactie.findFirstOrThrow({ where: { ondernemingId: o.id, bedrag: 605, datum: new Date(2026, 1, 1) } });
    check("deelbetaling als omzet met btw-deel", deel1.categorie === "omzet" && gelijk(deel1.btwBedrag ?? 0, 105), deel1);

    const Q1 = periodeBereik("kwartaal", 2026, 1);
    const Q2 = periodeBereik("kwartaal", 2026, 2);
    const a = await aangifteVoor(o.id, Q1.start, Q1.eind);
    // 1a: factuur 1000/210 + webshop 200/42. 1b: 200/18 - 200/18 = 0. 3a: 300. 3b: 500.
    check("1a omzet", gelijk(a["1a_omzet"], 1200), a);
    check("1a btw", gelijk(a["1a_btw"], 252), a);
    check("1b na creditfactuur nul", gelijk(a["1b_omzet"], 0) && gelijk(a["1b_btw"], 0), a);
    check("3a buiten EU", gelijk(a["3a_omzet"], 300), a);
    check("3b EU-dienst verkoop", gelijk(a["3b_omzet"], 500), a);
    // 2a verlegd inkoop 500 → 105; 4b EU-dienst inkoop 100 → 21.
    check("2a verlegd", gelijk(a["2a_omzet"], 500) && gelijk(a["2a_btw"], 105), a);
    check("4b EU-dienst inkoop", gelijk(a["4b_omzet"], 100) && gelijk(a["4b_btw"], 21), a);
    // 5a = 252 + 105 + 21 = 378. 5b = 210 + 10,50 (half privé) + 21 + 105 = 346,50. 5c = 31,50.
    check("5a verschuldigd", gelijk(a["5a_verschuldigd"], 378), a);
    check("5b voorbelasting (gemengd: half)", gelijk(a["5b_voorbelasting"], 346.5), a);
    check("5c te betalen", gelijk(a["5c_te_betalen"], 31.5), a);
    const a2 = await aangifteVoor(o.id, Q2.start, Q2.eind);
    check("Q2: tweede deelbetaling telt niet nog eens", gelijk(a2["1a_omzet"], 0) && gelijk(a2["5c_te_betalen"], 0), a2);

    // Winst Q1: omzet 1000 + 500 + 300 + 200 - 200 + 200 = 2000. Kosten: 1000 + 50 + 100 + 500 = 1650.
    const wv = await winstVerlies(o.id, Q1.start, Q1.eind);
    check("winst: omzet uit facturen en webshop", gelijk(wv.omzet, 2000), wv.omzet);
    check("winst: kosten zonder privédeel en btw", gelijk(wv.kosten, 1650), wv.kosten);
    check("winst", gelijk(wv.winst, 350), wv.winst);

    // Kasstelsel: omzet telt bij ontvangst. Q1: deel 1 (500/105) + webshop (200/42). Verlegd en VS nog niet betaald.
    await db.onderneming.update({ where: { id: o.id }, data: { btwStelsel: "kas" } });
    const k = await aangifteVoor(o.id, Q1.start, Q1.eind);
    check("kasstelsel 1a", gelijk(k["1a_omzet"], 700) && gelijk(k["1a_btw"], 147), k);
    check("kasstelsel 3a/3b leeg", k["3a_omzet"] === 0 && k["3b_omzet"] === 0, k);
    // Betaling van de Duitse (verlegde) factuur komt binnen: in het kasstelsel naar 3b, niet naar 1e.
    const deBetaling = await db.transactie.create({ data: t(new Date(2026, 2, 20), 500, "Muster GmbH", "Rechnung 2026-0002") });
    await letterAutomatischAf(o.id);
    const k3 = await aangifteVoor(o.id, Q1.start, Q1.eind);
    check("kasstelsel: betaalde EU-factuur in 3b", gelijk(k3["3b_omzet"], 500) && k3["1e_omzet"] === 0, k3);
    await db.transactie.delete({ where: { id: deBetaling.id } });
    await db.factuur.updateMany({ where: { ondernemingId: o.id, nummer: "2026-0002" }, data: { status: "verzonden", betaaldBedrag: 0, betaaldOp: null } });
    const k2 = await aangifteVoor(o.id, Q2.start, Q2.eind);
    check("kasstelsel Q2: tweede deel", gelijk(k2["1a_omzet"], 500) && gelijk(k2["1a_btw"], 105), k2);
    await db.onderneming.update({ where: { id: o.id }, data: { btwStelsel: "factuur" } });

    // KOR: geen btw-aangifte, factuur zonder btw.
    const korKlant = await db.klant.create({ data: { ondernemingId: kor.id, naam: "Klant" } });
    const korT = berekenTotalen([{ omschrijving: "Les", aantal: 1, prijs: 100, btw: 21 }], korKlant, { korDeelnemer: true });
    check("KOR factuur zonder btw", korT.btw === 0 && korT.totaal === 100, korT);
    await db.transactie.create({ data: { ondernemingId: kor.id, datum: new Date(2026, 1, 1), bedrag: -121, tegenpartij: "Shop", omschrijving: "x", hash: hash(), categorie: "kantoorkosten", btwCode: "21", btwBedrag: 21, zakelijk: true } });
    const ka = await aangifteVoor(kor.id, Q1.start, Q1.eind);
    check("KOR aangifte leeg", ka["5c_te_betalen"] === 0 && ka["5b_voorbelasting"] === 0, ka);

    // Inkomstenbelasting: met de hand. Winst 40.000, urencriterium, geen starter.
    const ib = berekenIb({ fiscaleWinst: 40000, uren: 1300, starter: false, investeringen: 0, kilometerVergoeding: 0 });
    const verwacht = Math.round((40000 - ZELFSTANDIGENAFTREK) * (1 - MKB_WINSTVRIJSTELLING) * 100) / 100;
    check("IB belastbare winst = (winst - zelfstandigenaftrek) × (1 - MKB)", gelijk(ib.belastbareWinst, verwacht), { ib: ib.belastbareWinst, verwacht });
    const geenUren = berekenIb({ fiscaleWinst: 40000, uren: 800, starter: false, investeringen: 0, kilometerVergoeding: 0 });
    check("IB zonder urencriterium: alleen MKB", gelijk(geenUren.belastbareWinst, Math.round(40000 * (1 - MKB_WINSTVRIJSTELLING) * 100) / 100), geenUren.belastbareWinst);

    // Vrij te besteden: banksaldo min btw van dit tijdvak min inkomstenbelasting.
    const vRek = await db.bankrekening.create({ data: { ondernemingId: vrijO.id, naam: "Zakelijk", iban: "NL01TEST0000000098" } });
    const nu = new Date();
    const huidig = periodeBereik("kwartaal", nu.getFullYear(), Math.floor(nu.getMonth() / 3) + 1);
    const d = new Date(Math.max(huidig.start.getTime() + 864e5, nu.getTime() - 864e5));
    await db.transactie.createMany({
      data: [
        { ondernemingId: vrijO.id, bankrekeningId: vRek.id, datum: d, bedrag: 12100, tegenpartij: "Klant", omschrijving: "opdracht", hash: hash(), categorie: "omzet", btwCode: "21", btwBedrag: 2100, zakelijk: true, bevestigd: true },
        { ondernemingId: vrijO.id, bankrekeningId: vRek.id, datum: d, bedrag: -1210, tegenpartij: "Coolblue", omschrijving: "laptoptas", hash: hash(), categorie: "kantoorkosten", btwCode: "21", btwBedrag: 210, zakelijk: true, bevestigd: true },
        { ondernemingId: vrijO.id, bankrekeningId: vRek.id, datum: d, bedrag: -300, tegenpartij: "Jumbo", omschrijving: "boodschappen", hash: hash(), categorie: "prive", zakelijk: false, bevestigd: true },
      ],
    });
    const g = await geldVooruit(await db.onderneming.findUniqueOrThrow({ where: { id: vrijO.id } }));
    check("banksaldo", gelijk(g.banksaldo ?? 0, 10590), g.banksaldo);
    check("btw opzij = 2100 - 210", gelijk(g.btwTeBetalen, 1890), g.btwTeBetalen);
    check("vrij = saldo - btw - IB", g.vrij != null && gelijk(g.vrij, 10590 - 1890 - g.ibOpzij) && g.ibOpzij >= 0, g);
  } finally {
    await db.onderneming.deleteMany({ where: { id: { in: [o.id, kor.id, vrijO.id] } } });
    await db.$disconnect();
  }
  if (fouten) { console.error(`${fouten} FOUT(EN)`); process.exit(1); }
  console.log("GETALLEN OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
