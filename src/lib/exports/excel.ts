import { MERK } from "@/lib/merk";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { kwartaalBereik } from "@/lib/btw";
import { label } from "@/lib/categorieen";
import { jaarrekening } from "@/lib/fiscaal/jaarrekening";
import { aangifteVoor } from "@/lib/btw-bron";

/** Volledige administratie van een jaar in één werkboek. */
export async function excelExport(ondernemingId: string, jaar: number): Promise<Buffer> {
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const [o, transacties, facturen, jr, bonnen, uren, km] = await Promise.all([
    db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } }),
    db.transactie.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" }, include: { bankrekening: true } }),
    db.factuur.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" }, include: { klant: true } }),
    jaarrekening(ondernemingId, jaar),
    db.bon.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" } }),
    db.urenregel.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" }, include: { klant: true } }),
    db.kilometerregel.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = MERK;
  wb.created = new Date();
  const geld = '€ #,##0.00;[Red]-€ #,##0.00';

  const kopStijl = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F4" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Transacties
  const t = wb.addWorksheet("Transacties");
  t.columns = [
    { header: "Datum", key: "datum", width: 12 },
    { header: "Rekening", key: "rekening", width: 16 },
    { header: "Tegenpartij", key: "tegenpartij", width: 28 },
    { header: "Omschrijving", key: "omschrijving", width: 40 },
    { header: "Bedrag", key: "bedrag", width: 14, style: { numFmt: geld } },
    { header: "Btw", key: "btw", width: 12, style: { numFmt: geld } },
    { header: "Btw-code", key: "btwCode", width: 10 },
    { header: "Categorie", key: "categorie", width: 24 },
    { header: "RGS", key: "rgs", width: 12 },
    { header: "Zakelijk", key: "zakelijk", width: 9 },
    { header: "Privédeel", key: "prive", width: 9 },
    { header: "Bevestigd", key: "bevestigd", width: 9 },
    { header: "Bron", key: "bron", width: 10 },
    { header: "Uitleg AI", key: "uitleg", width: 50 },
  ];
  for (const x of transacties) {
    t.addRow({
      datum: x.datum, rekening: x.bankrekening?.naam ?? "", tegenpartij: x.tegenpartij, omschrijving: x.omschrijving,
      bedrag: x.bedrag, btw: x.btwBedrag ?? 0, btwCode: x.btwCode ?? "", categorie: label(x.categorie), rgs: x.grootboek ?? "",
      zakelijk: x.zakelijk == null ? "?" : x.zakelijk ? "ja" : "nee", prive: x.priveDeel, bevestigd: x.bevestigd ? "ja" : "nee", bron: x.bron, uitleg: x.uitleg ?? "",
    });
  }
  t.getColumn("datum").numFmt = "dd-mm-yyyy";
  kopStijl(t);

  // Facturen
  const f = wb.addWorksheet("Facturen");
  f.columns = [
    { header: "Nummer", key: "nummer", width: 12 },
    { header: "Datum", key: "datum", width: 12, style: { numFmt: "dd-mm-yyyy" } },
    { header: "Vervaldatum", key: "verval", width: 12, style: { numFmt: "dd-mm-yyyy" } },
    { header: "Klant", key: "klant", width: 28 },
    { header: "Btw-nr klant", key: "btwnr", width: 16 },
    { header: "Subtotaal", key: "sub", width: 14, style: { numFmt: geld } },
    { header: "Btw", key: "btw", width: 12, style: { numFmt: geld } },
    { header: "Totaal", key: "totaal", width: 14, style: { numFmt: geld } },
    { header: "Betaald", key: "betaald", width: 14, style: { numFmt: geld } },
    { header: "Status", key: "status", width: 12 },
    { header: "Verlegd", key: "verlegd", width: 8 },
  ];
  for (const x of facturen) {
    f.addRow({ nummer: x.nummer, datum: x.datum, verval: x.vervaldatum, klant: x.klant.naam, btwnr: x.klant.btwNummer ?? "", sub: x.subtotaal, btw: x.btw, totaal: x.totaal, betaald: x.betaaldBedrag, status: x.status, verlegd: x.btwVerlegd ? "ja" : "" });
  }
  kopStijl(f);

  // W&V
  const w = wb.addWorksheet("Winst en verlies");
  w.columns = [{ header: "Post", key: "post", width: 40 }, { header: "RGS", key: "rgs", width: 14 }, { header: "Bedrag ex btw", key: "bedrag", width: 16, style: { numFmt: geld } }, { header: "Aftrekbaar", key: "aftrek", width: 16, style: { numFmt: geld } }];
  w.addRow({ post: "OMZET" }).font = { bold: true };
  for (const r of jr.wv.omzetRegels) w.addRow({ post: r.label, rgs: r.rgs, bedrag: r.bruto, aftrek: r.aftrekbaar });
  w.addRow({ post: "Totaal omzet", bedrag: jr.wv.omzet }).font = { bold: true };
  w.addRow({});
  w.addRow({ post: "KOSTEN" }).font = { bold: true };
  for (const r of jr.wv.kostenRegels) w.addRow({ post: r.label, rgs: r.rgs, bedrag: r.bruto, aftrek: r.aftrekbaar });
  w.addRow({ post: "Totaal kosten", bedrag: jr.wv.kosten, aftrek: jr.wv.kostenAftrekbaar }).font = { bold: true };
  w.addRow({});
  w.addRow({ post: "Winst", bedrag: jr.wv.winst, aftrek: jr.wv.fiscaleWinst }).font = { bold: true };
  kopStijl(w);

  // Balans
  const b = wb.addWorksheet("Balans");
  b.columns = [{ header: "Activa", key: "a", width: 36 }, { header: "Bedrag", key: "ab", width: 16, style: { numFmt: geld } }, { header: "Passiva", key: "p", width: 36 }, { header: "Bedrag", key: "pb", width: 16, style: { numFmt: geld } }];
  const n = Math.max(jr.activa.length, jr.passiva.length);
  for (let i = 0; i < n; i++) b.addRow({ a: jr.activa[i]?.label ?? "", ab: jr.activa[i]?.bedrag, p: jr.passiva[i]?.label ?? "", pb: jr.passiva[i]?.bedrag });
  b.addRow({ a: "Totaal", ab: jr.totaalActiva, p: "Totaal", pb: jr.totaalPassiva }).font = { bold: true };
  kopStijl(b);

  // Btw per kwartaal
  const q = wb.addWorksheet("Btw per kwartaal");
  q.columns = [{ header: "Rubriek", key: "r", width: 22 }, ...[1, 2, 3, 4].map((k) => ({ header: `Q${k}`, key: `q${k}`, width: 14, style: { numFmt: geld } })), { header: "Jaar", key: "jaar", width: 14, style: { numFmt: geld } }];
  const perK = await Promise.all([1, 2, 3, 4].map((k) => {
    const { start: s, eind: e } = kwartaalBereik(jaar, k);
    return aangifteVoor(ondernemingId, s, e);
  }));
  for (const rub of Object.keys(perK[0]) as (keyof (typeof perK)[0])[]) {
    const rij: Record<string, string | number> = { r: rub };
    let som = 0;
    perK.forEach((a, i) => { rij[`q${i + 1}`] = a[rub]; som += a[rub]; });
    rij.jaar = Math.round(som * 100) / 100;
    q.addRow(rij);
  }
  kopStijl(q);

  // Bonnen
  const bn = wb.addWorksheet("Bonnen");
  bn.columns = [{ header: "Datum", key: "datum", width: 12, style: { numFmt: "dd-mm-yyyy" } }, { header: "Leverancier", key: "lev", width: 28 }, { header: "Factuurnr", key: "nr", width: 16 }, { header: "Totaal", key: "totaal", width: 14, style: { numFmt: geld } }, { header: "Btw", key: "btw", width: 12, style: { numFmt: geld } }, { header: "Categorie", key: "cat", width: 24 }, { header: "Status", key: "status", width: 12 }, { header: "Bestand", key: "bestand", width: 30 }];
  for (const x of bonnen) bn.addRow({ datum: x.datum, lev: x.leverancier ?? "", nr: x.factuurnummer ?? "", totaal: x.totaal ?? 0, btw: x.btwBedrag ?? 0, cat: label(x.categorie), status: x.status, bestand: x.bestandsnaam });
  kopStijl(bn);

  // Uren en km
  const u = wb.addWorksheet("Uren");
  u.columns = [{ header: "Datum", key: "datum", width: 12, style: { numFmt: "dd-mm-yyyy" } }, { header: "Klant", key: "klant", width: 24 }, { header: "Uren", key: "uren", width: 8 }, { header: "Soort", key: "soort", width: 12 }, { header: "Omschrijving", key: "oms", width: 40 }, { header: "Gefactureerd", key: "gef", width: 12 }];
  for (const x of uren) u.addRow({ datum: x.datum, klant: x.klant?.naam ?? "", uren: x.uren, soort: x.soort, oms: x.omschrijving, gef: x.gefactureerd ? "ja" : "nee" });
  u.addRow({ klant: "Totaal", uren: uren.reduce((s, x) => s + x.uren, 0) }).font = { bold: true };
  kopStijl(u);
  const k = wb.addWorksheet("Kilometers");
  k.columns = [{ header: "Datum", key: "datum", width: 12, style: { numFmt: "dd-mm-yyyy" } }, { header: "Van", key: "van", width: 20 }, { header: "Naar", key: "naar", width: 20 }, { header: "Km", key: "km", width: 8 }, { header: "Retour", key: "retour", width: 8 }, { header: "Doel", key: "doel", width: 30 }, { header: "Vervoer", key: "vervoer", width: 14 }, { header: "Vergoeding", key: "verg", width: 12, style: { numFmt: geld } }];
  for (const x of km) k.addRow({ datum: x.datum, van: x.van, naar: x.naar, km: x.km, retour: x.retour ? "ja" : "", doel: x.doel, vervoer: x.vervoer, verg: x.vergoeding });
  kopStijl(k);

  const info = wb.addWorksheet("Info");
  info.addRow(["Onderneming", o.naam]);
  info.addRow(["KvK", o.kvk ?? ""]);
  info.addRow(["Btw-id", o.btwId ?? o.btwNummer ?? ""]);
  info.addRow(["Boekjaar", jaar]);
  info.addRow(["Gemaakt", new Date()]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
