import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { Factuur, Klant, Offerte, Onderneming } from "@prisma/client";
import { db } from "@/lib/db";
import { datumIn, euroIn, taalVan, vul, WOORDEN } from "./taal";
import { berekenTotalen, parseRegels, type FactuurRegel } from "./bereken";
import { hexOf, isLayout, isLetter, isLicht, tint, type Huisstijl } from "./huisstijl";

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
  handtekening?: { png: string; naam: string; op: Date } | null;
};

/** De huisstijl van een onderneming, met per veld een optionele overschrijving (voor het voorbeeld in Instellingen). */
export function huisstijlVan(o: Onderneming, over: Partial<Huisstijl> = {}): Huisstijl {
  // Het logo staat in de database (nieuw) of nog als bestand op schijf (oud). Alleen PNG en JPEG kunnen in een PDF.
  const logoVanO: Uint8Array | string | null =
    o.logo?.length && /^image\/(png|jpe?g)$/i.test(o.logoMime ?? "") ? o.logo
    : o.logoPad && !o.logoPad.startsWith("db:") && /\.(png|jpe?g)$/i.test(o.logoPad) && existsSync(o.logoPad) ? o.logoPad
    : null;
  return {
    layout: isLayout(over.layout) ? over.layout : isLayout(o.factuurLayout) ? o.factuurLayout : "klassiek",
    kleur: hexOf(over.kleur) ?? hexOf(o.huisstijlKleur) ?? "#1c1917",
    kleur2: over.kleur2 !== undefined ? hexOf(over.kleur2) : hexOf(o.huisstijlKleur2),
    letter: isLetter(over.letter) ? over.letter : isLetter(o.huisstijlLetter) ? o.huisstijlLetter : "helvetica",
    logo: over.logo !== undefined ? over.logo : logoVanO,
    voettekst: over.voettekst !== undefined ? over.voettekst : o.factuurVoettekst,
  };
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

/**
 * Bouwt de PDF en geeft een Buffer terug. Eén opbouw voor factuur, creditfactuur en offerte;
 * de lay-out (klassiek, modern, minimaal, accent), kleuren, lettertype en logo komen uit de huisstijl.
 */
export function maakPdf(o: Onderneming, klant: Klant, doc: Document, over?: Partial<Huisstijl>): Promise<Buffer> {
  const stijl = huisstijlVan(o, over);
  return new Promise((resolve, reject) => {
    // bufferPages: aan het eind tekenen we op elke pagina de rand, de voettekst en het paginanummer.
    const pdf = new PDFDocument({ size: "A4", margin: 50, bufferPages: true, info: { Title: `${doc.soort} ${doc.nummer}`, Author: o.naam } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    // Alles in de taal van de klant (Nederlands, Engels of Duits).
    const taal = taalVan(klant.taal);
    const w = WOORDEN[taal];
    const euro = (n: number) => euroIn(taal, n);
    const datumNl = (d: Date) => datumIn(taal, d);

    const L = stijl.layout;
    const F = stijl.letter === "times" ? { n: "Times-Roman", b: "Times-Bold" } : { n: "Helvetica", b: "Helvetica-Bold" };
    const kleur = stijl.kleur;
    const kleur2 = stijl.kleur2 ?? kleur;
    const opKleur = isLicht(kleur) ? "#1c1917" : "#ffffff"; // tekst op een vlak in de hoofdkleur
    const opKleur2 = isLicht(kleur2) ? "#1c1917" : "#ffffff";
    const donker = "#1c1917";
    const grijs = "#78716c";
    const lijn = "#e7e5e4";
    const labelKleur = L === "modern" || L === "accent" ? kleur2 : grijs;
    const breed = pdf.page.width - 100;
    const links = 50;
    const rechts = links + breed;

    /** Logo als het er is en leesbaar is, anders de bedrijfsnaam. */
    const logoOfNaam = (x: number, y: number, maxB: number, maxH: number, tekstKleur: string, grootte: number) => {
      if (stijl.logo) {
        try { pdf.image(stijl.logo as Buffer | string, x, y, { fit: [maxB, maxH] }); return; } catch { /* onleesbaar bestand: dan de naam */ }
      }
      pdf.fillColor(tekstKleur).fontSize(grootte).font(F.b).text(o.naam, x, y, { width: maxB });
    };

    // ── Kop: logo of naam links, titel en nummer rechts ──
    const titel = (doc.soort === "offerte" ? w.offerte : doc.soort === "credit" ? w.credit : w.factuur).toUpperCase();
    let y: number;
    if (L === "modern") {
      pdf.rect(0, 0, pdf.page.width, 118).fill(kleur);
      logoOfNaam(links, 36, 170, 50, opKleur, 20);
      pdf.fillColor(opKleur).fontSize(22).font(F.b).text(titel, links, 38, { width: breed, align: "right" });
      pdf.opacity(0.85).fillColor(opKleur).fontSize(11).font(F.n).text(doc.nummer, links, 66, { width: breed, align: "right" }).opacity(1);
      y = 150;
    } else if (L === "minimaal") {
      logoOfNaam(links, 50, 130, 40, donker, 13);
      pdf.fillColor(donker).fontSize(24).font(F.n).text(titel, links, 46, { width: breed, align: "right", characterSpacing: 1.5 });
      pdf.fillColor(grijs).fontSize(10).text(doc.nummer, links, 78, { width: breed, align: "right" });
      y = 140;
    } else {
      logoOfNaam(links, 50, 160, 60, kleur, 20);
      pdf.fillColor(kleur).fontSize(22).font(F.b).text(titel, links, 50, { width: breed, align: "right" });
      pdf.fillColor(donker).fontSize(11).font(F.n).text(doc.nummer, links, 78, { width: breed, align: "right" });
      if (L === "accent") pdf.moveTo(links, 118).lineTo(rechts, 118).strokeColor(kleur2).lineWidth(1).stroke();
      y = 130;
    }

    // ── Afzender en klant ──
    const kopje = (t: string, x: number, yy: number) => {
      if (L === "minimaal") pdf.fillColor(grijs).fontSize(8).font(F.b).text(t.toUpperCase(), x, yy, { characterSpacing: 0.8 });
      else pdf.fillColor(labelKleur).fontSize(9).font(L === "klassiek" ? F.n : F.b).text(t, x, yy);
    };
    kopje(taal === "nl" ? "Van" : taal === "de" ? "Von" : "From", links, y);
    pdf.fillColor(donker).fontSize(10).font(F.n);
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

    const kx = links + breed / 2;
    kopje(taal === "nl" ? "Aan" : taal === "de" ? "An" : "To", kx, y);
    pdf.fillColor(donker).fontSize(10).font(F.n);
    const kl = adresBlok(klant);
    kl.forEach((r, i) => pdf.text(r, kx, y + 14 + i * 13));
    let ky = y + 14 + kl.length * 13 + 4;
    pdf.fillColor(grijs).fontSize(8.5);
    if (klant.btwNummer) { pdf.text(`Btw-id ${klant.btwNummer}`, kx, ky); ky += 11; }
    if (klant.kvk) { pdf.text(`KvK ${klant.kvk}`, kx, ky); ky += 11; }

    // ── Datums ──
    y = Math.max(yy + meta.length * 11, ky) + 20;
    pdf.fontSize(9.5).font(F.n);
    const kol = [
      [doc.soort === "offerte" ? w.offertedatum : w.factuurdatum, datumNl(doc.datum)],
      [doc.soort === "offerte" ? w.geldigTot : w.vervaldatum, datumNl(doc.tweedeDatum)],
      doc.referentie ? [w.referentie, doc.referentie] : null,
      doc.creditVan ? [w.creditOp, doc.creditVan] : null,
    ].filter(Boolean) as [string, string][];
    kol.forEach(([k, v], i) => {
      pdf.fillColor(grijs).text(k, links + i * 130, y);
      pdf.fillColor(donker).text(v, links + i * 130, y + 12);
    });

    // ── Tabel ──
    y += 45;
    const kolommen = [
      { k: w.omschrijving, w: breed * 0.46, align: "left" as const },
      { k: w.aantal, w: breed * 0.12, align: "right" as const },
      { k: w.prijs, w: breed * 0.14, align: "right" as const },
      { k: w.btw, w: breed * 0.1, align: "right" as const },
      { k: w.bedrag, w: breed * 0.18, align: "right" as const },
    ];
    /** Tabelkop in de stijl van de lay-out; komt op elke nieuwe pagina terug. Geeft de y onder de kop. */
    const tabelKop = (ty: number): number => {
      if (L === "klassiek") { pdf.rect(links, ty, breed, 20).fill(kleur2); pdf.fillColor(opKleur2).fontSize(9).font(F.b); }
      else if (L === "accent") { pdf.rect(links, ty, breed, 20).fill(tint(kleur2, 0.86)); pdf.fillColor(kleur2).fontSize(9).font(F.b); }
      else if (L === "modern") { pdf.moveTo(links, ty + 20).lineTo(rechts, ty + 20).strokeColor(kleur2).lineWidth(1.5).stroke(); pdf.fillColor(kleur2).fontSize(9).font(F.b); }
      else { pdf.moveTo(links, ty + 20).lineTo(rechts, ty + 20).strokeColor(donker).lineWidth(0.5).stroke(); pdf.fillColor(grijs).fontSize(8).font(F.b); }
      let x = links + 6;
      kolommen.forEach((c) => {
        pdf.text(L === "minimaal" ? c.k.toUpperCase() : c.k, x, ty + 6, { width: c.w - 12, align: c.align, characterSpacing: L === "minimaal" ? 0.6 : 0 });
        x += c.w;
      });
      pdf.font(F.n).fillColor(donker).fontSize(9.5);
      return ty + 20;
    };
    y = tabelKop(y);
    const verlegdOfKor = doc.btwVerlegd || o.korDeelnemer;
    for (const r of doc.regels) {
      const hoogte = Math.max(18, pdf.heightOfString(r.omschrijving, { width: kolommen[0].w - 12 }) + 8);
      if (y + hoogte > pdf.page.height - 160) {
        pdf.addPage();
        y = tabelKop(50);
      }
      let x = links + 6;
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
      pdf.moveTo(links, y).lineTo(rechts, y).strokeColor(lijn).lineWidth(0.5).stroke();
    }

    /** Nieuwe pagina als het volgende blok niet meer past boven de voettekst. */
    const zorgRuimte = (h: number) => {
      if (y + h > pdf.page.height - 95) { pdf.addPage(); y = 50; }
    };

    // ── Totalen ──
    const tot = berekenTotalen(doc.regels, doc.btwVerlegd ? { land: "DE", btwNummer: "x" } : klant, o);
    y += 10;
    zorgRuimte(40 + tot.perTarief.length * 14);
    const tx = links + breed * 0.6;
    const tw = breed * 0.4;
    const regel = (k: string, v: string, vet = false, kleurV = donker) => {
      pdf.font(vet ? F.b : F.n).fontSize(vet ? 11 : 9.5).fillColor(donker);
      pdf.text(k, tx, y, { width: tw * 0.55 });
      pdf.fillColor(kleurV).text(v, tx + tw * 0.55, y, { width: tw * 0.45 - 6, align: "right" });
      y += vet ? 18 : 14;
    };
    regel(w.subtotaal, euro(tot.subtotaal));
    for (const p of tot.perTarief) {
      if (p.tarief === 0 && tot.perTarief.length > 1 && p.btw === 0) continue;
      regel(vul(w.btwOver, { pct: p.tarief, grondslag: euro(p.grondslag) }), euro(p.btw));
    }
    if (L === "modern") {
      // Het totaal in een licht vlak in de hoofdkleur.
      pdf.rect(tx - 8, y + 3, tw + 8, 24).fill(tint(kleur, 0.9));
      y += 8;
      regel(w.totaal, euro(tot.totaal), true);
    } else {
      pdf.moveTo(tx, y + 2).lineTo(tx + tw, y + 2).strokeColor(L === "minimaal" ? donker : kleur2).lineWidth(L === "minimaal" ? 0.5 : 1).stroke();
      y += 8;
      regel(w.totaal, euro(tot.totaal), true, L === "minimaal" ? kleur : donker);
    }

    // ── Voet: betaalverzoek, btw-tekst, opmerking, handtekening ──
    y += 16;
    const alinea = (t: string, opties: { kleur?: string; link?: string } = {}) => {
      pdf.font(F.n).fontSize(9.5).fillColor(opties.kleur ?? donker);
      const h = pdf.heightOfString(t, { width: breed });
      zorgRuimte(h + 8);
      if (opties.link) pdf.text(t, links, y, { width: breed, link: opties.link, underline: true });
      else pdf.text(t, links, y, { width: breed });
      y += h + 8;
    };
    if (doc.btwVerlegd) alinea(w.verlegd);
    else if (o.korDeelnemer) alinea(w.kor);
    if (doc.soort === "factuur") {
      alinea(vul(w.betaalverzoek, { bedrag: euro(tot.totaal), datum: datumNl(doc.tweedeDatum), iban: o.iban ?? "[IBAN]", naam: o.naam, nummer: doc.kenmerk ?? doc.nummer }));
      if (doc.betaalLink) alinea(`${w.directBetalen}: ${doc.betaalLink}`, { kleur, link: doc.betaalLink });
    } else if (doc.soort === "credit") {
      alinea(w.creditTekst);
    } else {
      alinea(vul(w.offerteTekst, { datum: datumNl(doc.tweedeDatum) }));
    }
    if (doc.opmerking) alinea(doc.opmerking, { kleur: "#44403c" });
    if (doc.handtekening) {
      zorgRuimte(90);
      const tekst = taal === "nl" ? "Voor akkoord getekend door" : taal === "de" ? "Zur Bestätigung unterschrieben von" : "Signed for approval by";
      pdf.fillColor(grijs).fontSize(9).font(F.n).text(`${tekst} ${doc.handtekening.naam}, ${datumNl(doc.handtekening.op)}`, links, y + 6, { width: breed });
      try { pdf.image(Buffer.from(doc.handtekening.png.split(",")[1] ?? "", "base64"), links, y + 20, { fit: [180, 60] }); } catch { /* onleesbare handtekening: alleen de tekst */ }
      y += 86;
    }

    // ── Op elke pagina: rand of band van de lay-out, voettekst en bij meer pagina's het paginanummer ──
    const paginas = pdf.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      pdf.switchToPage(paginas.start + i);
      if (L === "accent") pdf.rect(0, 0, 10, pdf.page.height).fill(kleur);
      if (L === "modern" && i > 0) pdf.rect(0, 0, pdf.page.width, 8).fill(kleur);
      // Onder de ondermarge schrijven mag niet van pdfkit (dan begint het een nieuwe pagina); even de marge op nul.
      const onder = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      pdf.font(F.n).fontSize(8).fillColor(grijs);
      if (stijl.voettekst) {
        const h = Math.min(pdf.heightOfString(stijl.voettekst, { width: breed }), 44);
        pdf.text(stijl.voettekst, links, pdf.page.height - 36 - h, { width: breed, height: h, align: L === "minimaal" ? "left" : "center", ellipsis: true });
      }
      if (paginas.count > 1) pdf.text(`${i + 1} / ${paginas.count}`, links, pdf.page.height - 30, { width: breed, align: "right", lineBreak: false });
      pdf.page.margins.bottom = onder;
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
    handtekening: offerte.handtekening && offerte.getekendOp ? { png: offerte.handtekening, naam: offerte.getekendDoor ?? "", op: offerte.getekendOp } : null,
  });
  const pad = await bewaar(offerte.ondernemingId, "offertes", `${offerte.nummer.replace(/[^\w-]/g, "_")}.pdf`, buf);
  await db.offerte.update({ where: { id: offerte.id }, data: { pdfPad: pad } });
  return buf;
}

/** Voorbeeld met een fictieve klant en regels, om de huisstijl te bekijken voordat je opslaat. */
export function voorbeeldPdf(o: Onderneming, soort: "factuur" | "offerte", over: Partial<Huisstijl>): Promise<Buffer> {
  const klant = {
    id: "voorbeeld", ondernemingId: o.id, naam: "Bakkerij De Korst", contactpersoon: "Anne de Vries", email: null, telefoon: null,
    adres: "Keizersgracht 12", postcode: "1015 CJ", plaats: "Amsterdam", land: "NL", kvk: null, btwNummer: "NL001234567B01",
    isOndernemer: true, betaaltermijn: null, notities: null, taal: "nl", externId: null, aangemaakt: new Date(),
  } satisfies Klant;
  const vandaag = new Date();
  const later = new Date(vandaag.getTime() + (soort === "factuur" ? o.betaaltermijn : 30) * 864e5);
  const jaar = vandaag.getFullYear();
  return maakPdf(o, klant, {
    soort,
    nummer: soort === "factuur" ? `${o.factuurPrefix}${jaar}-0042` : `${o.offertePrefix}${jaar}-0007`,
    datum: vandaag,
    tweedeDatum: later,
    referentie: soort === "factuur" ? "Opdracht 2026-18" : null,
    opmerking: "Bedankt voor je opdracht. Vragen? Bel of mail gerust.",
    regels: [
      { omschrijving: "Ontwerp en bouw van de website", aantal: 1, prijs: 2450, btw: 21, eenheid: "stuk" },
      { omschrijving: "Hosting en onderhoud", aantal: 3, prijs: 45, btw: 21, eenheid: "maand" },
      { omschrijving: "Fotografie op locatie", aantal: 2, prijs: 95, btw: 21, eenheid: "uur" },
      { omschrijving: "Drukwerk: 50 brochures", aantal: 50, prijs: 2.5, btw: 9, eenheid: "stuk" },
    ],
    btwVerlegd: false,
  }, over);
}
