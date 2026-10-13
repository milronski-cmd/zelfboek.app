import { writeFileSync, statSync } from "fs";
import { XMLParser } from "fast-xml-parser";
import { berekenTotalen, isVerlegd } from "../src/lib/facturen/bereken";
import { maakPdf } from "../src/lib/facturen/pdf";
import { maakUbl } from "../src/lib/facturen/ubl";
import { incassokosten, wettelijkeRente } from "../src/lib/facturen/herinneringen";
import { volgendeDatum } from "../src/lib/facturen/terugkerend";

const regels = [
  { omschrijving: "Websiteontwerp", aantal: 1, prijs: 1000, btw: 21, eenheid: "stuk" },
  { omschrijving: "Boeken", aantal: 2, prijs: 25, btw: 9, eenheid: "stuk" },
];
const nl = berekenTotalen(regels, { land: "NL" }, { korDeelnemer: false });
console.log("NL", nl);
if (nl.subtotaal !== 1050 || nl.btw !== 214.5 || nl.totaal !== 1264.5 || nl.btwVerlegd) throw new Error("NL-berekening fout");
const de = berekenTotalen(regels, { land: "DE", btwNummer: "DE123", isOndernemer: true }, {});
if (!de.btwVerlegd || de.btw !== 0 || de.totaal !== 1050) throw new Error("verlegd fout");
if (isVerlegd({ land: "DE", btwNummer: null })) throw new Error("DE zonder btw-nummer mag niet verlegd");
if (!isVerlegd({ land: "US" })) throw new Error("buiten EU moet verlegd");
const kor = berekenTotalen(regels, { land: "NL" }, { korDeelnemer: true });
if (kor.btw !== 0) throw new Error("KOR fout");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const o: any = { id: "o1", naam: "Studio Milronski", adres: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Amsterdam", land: "NL", kvk: "12345678", btwId: "NL001234567B01", iban: "NL02ABNA0123456789", email: "info@studio.nl", huisstijlKleur: "#0f766e", korDeelnemer: false, factuurVoettekst: "Op al onze diensten zijn onze algemene voorwaarden van toepassing.", logoPad: null, telefoon: null, website: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const klant: any = { id: "k1", naam: "Klant BV", contactpersoon: "Jan Jansen", adres: "Kade 9", postcode: "5678 CD", plaats: "Rotterdam", land: "NL", btwNummer: "NL009876543B01", kvk: null, email: "jan@klant.nl" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const f: any = { id: "f1", ondernemingId: "o1", nummer: "2026-0001", soort: "factuur", datum: new Date("2026-10-08"), vervaldatum: new Date("2026-10-22"), regels: JSON.stringify(regels), subtotaal: nl.subtotaal, btw: nl.btw, totaal: nl.totaal, btwVerlegd: false, valuta: "EUR", referentie: "PO-77", opmerking: "Bedankt voor de opdracht.", betaalLinkUrl: "https://pay.example/x" };

(async () => {
  const pdf = await maakPdf(o, klant, { soort: "factuur", nummer: f.nummer, datum: f.datum, tweedeDatumLabel: "Vervaldatum", tweedeDatum: f.vervaldatum, referentie: f.referentie, opmerking: f.opmerking, regels, btwVerlegd: false, kenmerk: f.nummer, betaalLink: f.betaalLinkUrl });
  writeFileSync("test/uit/factuur.pdf", pdf);
  const grootte = statSync("test/uit/factuur.pdf").size;
  console.log("PDF bytes:", grootte);
  if (grootte < 1024 || pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("PDF fout");
  const offertePdf = await maakPdf(o, klant, { soort: "offerte", nummer: "OFF-2026-0001", datum: f.datum, tweedeDatumLabel: "Geldig tot", tweedeDatum: new Date("2026-11-07"), regels, btwVerlegd: false });
  writeFileSync("test/uit/offerte.pdf", offertePdf);
  if (offertePdf.length < 1024) throw new Error("offerte-PDF fout");

  // Elke lay-out met elk lettertype, als factuur en als offerte, plus een lange factuur (meer pagina's: rand en tabelkop op elke pagina).
  const { LAYOUTS, LETTERS } = await import("../src/lib/facturen/huisstijl");
  const veel = Array.from({ length: 45 }, (_, i) => ({ omschrijving: `Regel ${i + 1}: werkzaamheden volgens afspraak`, aantal: 1, prijs: 10 + i, btw: 21, eenheid: "uur" }));
  for (const l of LAYOUTS) {
    for (const t of LETTERS) {
      const stijl = { layout: l.k, letter: t.k, kleur: "#0a7ea3", kleur2: l.k === "accent" ? "#2b8273" : null, voettekst: o.factuurVoettekst as string };
      const a = await maakPdf(o, klant, { soort: "factuur", nummer: `F-${l.k}`, datum: f.datum, tweedeDatum: f.vervaldatum, regels, btwVerlegd: false, betaalLink: f.betaalLinkUrl }, stijl);
      const b = await maakPdf(o, klant, { soort: "offerte", nummer: `O-${l.k}`, datum: f.datum, tweedeDatum: f.vervaldatum, regels, btwVerlegd: false }, stijl);
      const c = await maakPdf(o, klant, { soort: "factuur", nummer: `L-${l.k}`, datum: f.datum, tweedeDatum: f.vervaldatum, regels: veel, btwVerlegd: false }, stijl);
      if (t.k === "helvetica") { writeFileSync(`test/uit/factuur-${l.k}.pdf`, a); writeFileSync(`test/uit/offerte-${l.k}.pdf`, b); writeFileSync(`test/uit/factuur-${l.k}-lang.pdf`, c); }
      for (const p of [a, b, c]) if (p.length < 1024 || p.subarray(0, 4).toString() !== "%PDF") throw new Error(`lay-out ${l.k}/${t.k} fout`);
      if ((c.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length < 2) throw new Error(`lange factuur ${l.k} heeft maar één pagina`);
    }
  }
  console.log("lay-outs OK:", LAYOUTS.map((l) => l.k).join(", "));

  const xml = maakUbl(f, klant, o);
  writeFileSync("test/uit/factuur.xml", xml);
  const p = new XMLParser({ ignoreAttributes: false });
  const doc = p.parse(xml);
  const inv = doc.Invoice;
  if (!inv) throw new Error("geen Invoice-root");
  const totaal = Number(inv["cac:LegalMonetaryTotal"]["cbc:PayableAmount"]["#text"]);
  const taxAmount = Number(inv["cac:TaxTotal"]["cbc:TaxAmount"]["#text"]);
  console.log("UBL totaal", totaal, "btw", taxAmount, "regels", inv["cac:InvoiceLine"].length);
  if (totaal !== 1264.5 || taxAmount !== 214.5 || inv["cac:InvoiceLine"].length !== 2) throw new Error("UBL-bedragen fout");
  if (!String(inv["cbc:CustomizationID"]).includes("nlcius")) throw new Error("NLCIUS ontbreekt");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credit: any = { ...f, soort: "credit", nummer: "2026-0002", regels: JSON.stringify(regels.map((r) => ({ ...r, aantal: -r.aantal }))) };
  const cx = p.parse(maakUbl(credit, klant, o));
  if (!cx.CreditNote || cx.CreditNote["cac:CreditNoteLine"].length !== 2) throw new Error("CreditNote fout");

  console.log("incasso 500:", incassokosten(500), "incasso 10000:", incassokosten(10000), "rente 1000/30d:", wettelijkeRente(1000, 30));
  if (incassokosten(500) !== 75 || incassokosten(10000) !== 875) throw new Error("WIK fout");
  const v = volgendeDatum(new Date("2026-01-31"), "maand");
  console.log("volgende maand na 31-01:", v.toISOString().slice(0, 10));
  console.log("FACTUREN-TEST OK");
})().catch((e) => { console.error(e); process.exit(1); });
