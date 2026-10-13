process.env.DATABASE_URL ??= "file:./dev.db";
import { PrismaClient } from "@prisma/client";
import { importeerRegels, parseBankbestand } from "../src/lib/bank/importeer";
import { maakSjabloon, importeerExcel } from "../src/lib/import/excel";
import { importeerJorttCsv } from "../src/lib/import/jortt";
import { importeerPaypalCsv } from "../src/lib/kanalen/paypal";

const db = new PrismaClient();
(async () => {
  const o = await db.onderneming.create({ data: { naam: "Test import" } });
  try {
    const csv = `"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"
"20260915","Klant BV","NL01INGB0001234567","NL02RABO0002","OV","Bij","1210,00","Overschrijving","Factuur 2026-0001"
"20260916","Vercel Inc","NL01INGB0001234567","","BA","Af","24,20","Betaalautomaat","Vercel Pro"`;
    const p = parseBankbestand(csv, "ing.csv");
    const r1 = await importeerRegels(o.id, p.regels, { bron: "csv", bank: p.bank, eigenIban: p.eigenIban, beoordeel: false });
    const r2 = await importeerRegels(o.id, p.regels, { bron: "csv", bank: p.bank, eigenIban: p.eigenIban, beoordeel: false });
    if (r1.nieuw !== 2 || r2.nieuw !== 0 || r2.dubbel !== 2 || !r1.bankrekeningId) throw new Error("importeerRegels: " + JSON.stringify([r1, r2]));
    const rek = await db.bankrekening.findFirst({ where: { ondernemingId: o.id } });
    if (rek?.iban !== "NL01INGB0001234567" || rek.bank !== "ING") throw new Error("bankrekening fout");
    console.log("ok  importeerRegels + dubbelen + bankrekening");

    const mt = `:20:X\n:25:NL01INGB0001234567EUR\n:61:2609170917D10,00NTRFNONREF//1\n:86:/NAME/KPN/REMI/Telefoon\n-`;
    const r3 = await importeerRegels(o.id, parseBankbestand(mt).regels, { bron: "mt940", beoordeel: false });
    if (r3.nieuw !== 1 || r3.bankrekeningId !== rek.id) throw new Error("mt940 naar bestaande rekening fout");
    console.log("ok  MT940 autodetectie naar bestaande rekening");

    const sjabloon = await maakSjabloon();
    const ex = await importeerExcel(o.id, sjabloon);
    if (ex.regels !== 2) throw new Error("excel: " + JSON.stringify(ex));
    const inv = await db.transactie.findFirst({ where: { ondernemingId: o.id, categorie: "investering" } });
    if (!inv || inv.bedrag !== -1452 || !inv.bevestigd) throw new Error("excel categorie");
    console.log("ok  Excel-sjabloon maken en terug inlezen");

    const jk = await importeerJorttCsv(o.id, `Naam,E-mail,Plaats\nJansen BV,j@j.nl,Utrecht`);
    const jb = await importeerJorttCsv(o.id, `Datum;Omschrijving;Relatie;Bedrag;Categorie;Btw-tarief\n2026-02-01;Advies;Jansen BV;605,00;Omzet;21%`);
    if (jk.klanten !== 1 || jb.regels !== 1) throw new Error("jortt: " + JSON.stringify([jk, jb]));
    console.log("ok  Jortt klanten en boekingen");

    const pp = await importeerPaypalCsv(o.id, `"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","Transaction ID"\n"10/09/2026","10:00:00","CEST","Piet","Website Payment","Completed","EUR","50,00","-1,99","48,01","p@p.nl","ABC123"`);
    const ppRegels = await db.transactie.count({ where: { ondernemingId: o.id, bron: "paypal" } });
    if (pp.nieuw !== 2 || ppRegels !== 2) throw new Error("paypal: " + JSON.stringify(pp));
    console.log("ok  PayPal CSV (omzet + kosten)");

    // Dezelfde bankregel bij twee verschillende ondernemingen: bankregels zijn alleen dubbel binnen
    // dezelfde onderneming. De hash-kolom is in de databank wél uniek over álle ondernemingen, dus
    // zonder deze controle verdween de regel van de tweede klant stil als 'dubbel overgeslagen'.
    const o2 = await db.onderneming.create({ data: { naam: "Test import tweede klant" } });
    try {
      const nog = parseBankbestand(csv, "ing.csv");
      const b1 = await importeerRegels(o2.id, nog.regels, { bron: "csv", bank: nog.bank, eigenIban: nog.eigenIban, beoordeel: false });
      if (b1.nieuw !== 2 || b1.dubbel !== 0) throw new Error("tweede onderneming raakt regels kwijt: " + JSON.stringify(b1));
      const b2 = await importeerRegels(o2.id, nog.regels, { bron: "csv", bank: nog.bank, eigenIban: nog.eigenIban, beoordeel: false });
      if (b2.nieuw !== 0 || b2.dubbel !== 2) throw new Error("dubbelen bij dezelfde onderneming: " + JSON.stringify(b2));
      console.log("ok  zelfde regel bij twee ondernemingen blijft bij allebei staan");
    } finally {
      await db.onderneming.delete({ where: { id: o2.id } });
    }
    console.log("IMPORT OK");
  } finally {
    await db.transactie.deleteMany({ where: { ondernemingId: o.id } });
    await db.onderneming.delete({ where: { id: o.id } });
    await db.$disconnect();
  }
})().catch((e) => { console.error("FOUT", e); process.exit(1); });
