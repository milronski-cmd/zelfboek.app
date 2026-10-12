import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { Factuur, Klant, Offerte, Onderneming } from "@prisma/client";
import { db } from "@/lib/db";
import { datumIn, euroIn, taalVan, vul, WOORDEN } from "./taal";
import { berekenTotalen, parseRegels, type FactuurRegel } from "./bereken";

type Document = {
  soort: "factuur" | "credit" | "offerte";
  nummer: string;
  datum: Date;
  tweedeDatumLabel?: string; // niet meer nodig: het label volgt de taal van de klant
  tweedeDatum: Date;
  referentie?: string | null;
  opmerking?: string | null;
  regels: FactuurRegel[];
  btwVerlegd: boolean;
  kenmerk?: string;
  betaalLink?: string | null;
  creditVan?: string | null;
};

function hexNaarRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return [28, 25, 23];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function adresBlok(x: { naam?: string | null; contactpersoon?: string | null; adres?: string | null; postcode?: string | null; plaats?: string | null; land?: string | null }) {
  return [
    x.naam,
    x.contactpersoon,
    x.adres,
    [x.postcode, x.plaats].filter(Boolean).join(" "),
    x.land && x.land !== "NL" ? x.land : null,
  ].filter((s) => s && String(s).trim()).map(String);
}

/** Bouwt de PDF en geeft een Buffer terug. */
export function maakPdf(o: Onderneming, klant: Klant, doc: Document): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${doc.soort} ${doc.nummer}`, Author: o.naam } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    // Alles in de taal van de klant (Nederlands, Engels of Duits).
    const taal = taalVan(klant.taal);
    const w = WOORDEN[taal];
    const euro = (n: number) => euroIn(taal, n);
    const datumNl = (d: Date) => datumIn(taal, d);
    const kleur = hexNaarRgb(o.huisstijlKleur);
    const grijs = "#78716c";
    const lijn = "#e7e5e4";
    const breed = pdf.page.width - 100;
    const links = 50;

    // Kop: logo of naam
    let y = 50;
    const logoBron = o.logo && /^image\/(png|jpe?g)$/i.test(o.logoMime ?? "") ? Buffer.from(o.logo) : o.logoPad && existsSync(o.logoPad) && /\.(png|jpe?g)$/i.test(o.logoPad) ? o.logoPad : null;
    if (logoBron) {
      try {
        pdf.image(logoBron, links, y, { fit: [160, 60] });
      } catch {
        pdf.fillColor(kleur).fontSize(20).font("Helvetica-Bold").text(o.naam, links, y);
      }
    } else {
      pdf.fillColor(kleur).fontSize(20).font("Helvetica-Bold").text(o.naam, links, y);
    }

    const titel = (doc.soort === "offerte" ? w.offerte : doc.soort === "credit" ? w.credit : w.factuur).toUpperCase();
    pdf.fillColor(kleur).fontSize(22).font("Helvetica-Bold").text(titel, links, y, { width: breed, align: "right" });
    pdf.fillColor("#1c1917").fontSize(11).font("Helvetica").text(doc.nummer, links, y + 28, { width: breed, align: "right" });

    // Afzender
    y = 130;
    pdf.fontSize(9).fillColor(grijs).text(taal === "nl" ? "Van" : taal === "de" ? "Von" : "From", links, y);
    pdf.fillColor("#1c1917").fontSize(10);
    const afz = adresBlok({ naam: o.naam, adres: o.adres, postcode: o.postcode, plaats: o.plaats, land: o.land });
    afz.forEach((r, i) => pdf.text(r, links, y + 14 + i * 13));
    const yy = y + 14 + afz.length * 13 + 4;
    pdf.fillColor(grijs).fontSize(8.5);
    const meta = [
      o.kvk ? `KvK ${o.kvk}` : null,
      o.btwId || o.btwNummer ? `Btw-id ${o.btwId ?? o.btwNummer}` : null,
      o.iban ? `IBAN ${o.iban}` : null,
      o.email,
      o.telefoon,
      o.website,
    ].filter(Boolean) as string[];
    meta.forEach((r, i) => pdf.text(r, links, yy + i * 11));

    // Klant
    const kx = links + breed / 2;
    pdf.fontSize(9).fillColor(grijs).text(taal === "nl" ? "Aan" : taal === "de" ? "An" : "To", kx, y);
    pdf.fillColor("#1c1917").fontSize(10);
    const kl = adresBlok(klant);
    kl.forEach((r, i) => pdf.text(r, kx, y + 14 + i * 13));
    let ky = y + 14 + kl.length * 13 + 4;
    pdf.fillColor(grijs).fontSize(8.5);
    if (klant.btwNummer) { pdf.text(`Btw-id ${klant.btwNummer}`, kx, ky); ky += 11; }
    if (klant.kvk) { pdf.text(`KvK ${klant.kvk}`, kx, ky); ky += 11; }

    // Datums
    y = Math.max(yy + meta.length * 11, ky) + 20;
    pdf.fontSize(9.5).fillColor("#1c1917");
    const kol = [
      [doc.soort === "offerte" ? w.offertedatum : w.factuurdatum, datumNl(doc.datum)],
      [doc.soort === "offerte" ? w.geldigTot : w.vervaldatum, datumNl(doc.tweedeDatum)],
      doc.referentie ? [w.referentie, doc.referentie] : null,
      doc.creditVan ? [w.creditOp, doc.creditVan] : null,
    ].filter(Boolean) as [string, string][];
    kol.forEach(([k, v], i) => {
      pdf.fillColor(grijs).text(k, links + i * 130, y);
      pdf.fillColor("#1c1917").text(v, links + i * 130, y + 12);
    });

    // Tabel
    y += 45;
    const kolommen = [
      { k: w.omschrijving, w: breed * 0.46, align: "left" as const },
      { k: w.aantal, w: breed * 0.12, align: "right" as const },
      { k: w.prijs, w: breed * 0.14, align: "right" as const },
      { k: w.btw, w: breed * 0.1, align: "right" as const },
      { k: w.bedrag, w: breed * 0.18, align: "right" as const },
    ];
    pdf.rect(links, y, breed, 20).fill(kleur);
    let x = links + 6;
    pdf.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    kolommen.forEach((c) => {
      pdf.text(c.k, x, y + 6, { width: c.w - 12, align: c.align });
      x += c.w;
    });
    y += 20;
    pdf.font("Helvetica").fillColor("#1c1917").fontSize(9.5);
    const verlegdOfKor = doc.btwVerlegd || o.korDeelnemer;
    for (const r of doc.regels) {
      const hoogte = Math.max(18, pdf.heightOfString(r.omschrijving, { width: kolommen[0].w - 12 }) + 8);
      if (y + hoogte > pdf.page.height - 160) {
        pdf.addPage();
        y = 50;
      }
      x = links + 6;
      const cellen = [
        r.omschrijving,
        `${r.aantal}${r.eenheid ? ` ${r.eenheid}` : ""}`,
        euro(r.prijs),
        verlegdOfKor ? "0%" : `${r.btw}%`,
        euro(r.aantal * r.prijs),
      ];
      cellen.forEach((t, i) => {
        pdf.text(t, x, y + 5, { width: kolommen[i].w - 12, align: kolommen[i].align });
        x += kolommen[i].w;
      });
      y += hoogte;
      pdf.moveTo(links, y).lineTo(links + breed, y).strokeColor(lijn).lineWidth(0.5).stroke();
    }

    // Totalen
    const tot = berekenTotalen(doc.regels, doc.btwVerlegd ? { land: "DE", btwNummer: "x" } : klant, o);
    y += 10;
    const tx = links + breed * 0.6;
    const tw = breed * 0.4;
    const regel = (k: string, v: string, vet = false) => {
      pdf.font(vet ? "Helvetica-Bold" : "Helvetica").fontSize(vet ? 11 : 9.5).fillColor("#1c1917");
      pdf.text(k, tx, y, { width: tw * 0.55 });
      pdf.text(v, tx + tw * 0.55, y, { width: tw * 0.45 - 6, align: "right" });
      y += vet ? 18 : 14;
    };
    regel(w.subtotaal, euro(tot.subtotaal));
    for (const p of tot.perTarief) {
      if (p.tarief === 0 && tot.perTarief.length > 1 && p.btw === 0) continue;
      regel(vul(w.btwOver, { pct: p.tarief, grondslag: euro(p.grondslag) }), euro(p.btw));
    }
    pdf.moveTo(tx, y + 2).lineTo(tx + tw, y + 2).strokeColor(kleur).lineWidth(1).stroke();
    y += 8;
    regel(w.totaal, euro(tot.totaal), true);

    // Voet
    y += 16;
    pdf.font("Helvetica").fontSize(9.5).fillColor("#1c1917");
    if (doc.btwVerlegd) {
      pdf.text(w.verlegd, links, y, { width: breed });
      y += 16;
    } else if (o.korDeelnemer) {
      pdf.text(w.kor, links, y, { width: breed });
      y += 16;
    }
    if (doc.soort === "factuur") {
      pdf.text(
        vul(w.betaalverzoek, { bedrag: euro(tot.totaal), datum: datumNl(doc.tweedeDatum), iban: o.iban ?? "[IBAN]", naam: o.naam, nummer: doc.kenmerk ?? doc.nummer }),
        links, y, { width: breed },
      );
      y += 30;
      if (doc.betaalLink) {
        pdf.fillColor(kleur).text(`${w.directBetalen}: ${doc.betaalLink}`, links, y, { width: breed, link: doc.betaalLink, underline: true });
        y += 16;
      }
    } else if (doc.soort === "credit") {
      pdf.text(w.creditTekst, links, y, { width: breed });
      y += 20;
    } else {
      pdf.text(vul(w.offerteTekst, { datum: datumNl(doc.tweedeDatum) }), links, y, { width: breed });
      y += 20;
    }
    if (doc.opmerking) {
      pdf.fillColor("#44403c").text(doc.opmerking, links, y, { width: breed });
      y += pdf.heightOfString(doc.opmerking, { width: breed }) + 8;
    }
    if (o.factuurVoettekst) {
      pdf.fontSize(8).fillColor(grijs).text(o.factuurVoettekst, links, pdf.page.height - 70, { width: breed, align: "center" });
    }
    pdf.end();
  });
}

/** Kopie op schijf voor lokaal gebruik; op Vercel (alleen-lezen) slaan we dit stilzwijgend over. */
async function bewaar(ondernemingId: string, map: string, naam: string, data: Buffer) {
  try {
    const dir = path.join(process.cwd(), "uploads", ondernemingId, map);
    await mkdir(dir, { recursive: true });
    const pad = path.join(dir, naam);
    await writeFile(pad, data);
    return pad;
  } catch {
    return "";
  }
}

/** Factuur-PDF maken, opslaan en pdfPad zetten. */
export async function factuurPdf(factuur: Factuur & { klant: Klant; onderneming: Onderneming }): Promise<Buffer> {
  let creditVan: string | null = null;
  if (factuur.soort === "credit" && factuur.gecrediteerdDoorId) {
    const orig = await db.factuur.findUnique({ where: { id: factuur.gecrediteerdDoorId }, select: { nummer: true } });
    creditVan = orig?.nummer ?? null;
  }
  const buf = await maakPdf(factuur.onderneming, factuur.klant, {
    soort: factuur.soort === "credit" ? "credit" : "factuur",
    nummer: factuur.nummer,
    datum: factuur.datum,
    tweedeDatum: factuur.vervaldatum,
    referentie: factuur.referentie,
    opmerking: factuur.opmerking,
    regels: parseRegels(factuur.regels),
    btwVerlegd: factuur.btwVerlegd,
    kenmerk: factuur.nummer,
    betaalLink: factuur.betaalLinkUrl,
    creditVan,
  });
  const pad = await bewaar(factuur.ondernemingId, "facturen", `${factuur.nummer.replace(/[^\w-]/g, "_")}.pdf`, buf);
  await db.factuur.update({ where: { id: factuur.id }, data: { pdfPad: pad } });
  return buf;
}

export async function offertePdf(offerte: Offerte & { klant: Klant; onderneming: Onderneming }): Promise<Buffer> {
  const buf = await maakPdf(offerte.onderneming, offerte.klant, {
    soort: "offerte",
    nummer: offerte.nummer,
    datum: offerte.datum,
    tweedeDatum: offerte.geldigTot,
    opmerking: offerte.opmerking,
    regels: parseRegels(offerte.regels),
    btwVerlegd: false,
  });
  const pad = await bewaar(offerte.ondernemingId, "offertes", `${offerte.nummer.replace(/[^\w-]/g, "_")}.pdf`, buf);
  await db.offerte.update({ where: { id: offerte.id }, data: { pdfPad: pad } });
  return buf;
}
