import ExcelJS from "exceljs";
import { voegTransactieToe } from "@/lib/bank/importeer";
import { datum, getal, maakHash } from "@/lib/bank/csv";
import { BTW_CODES, CATEGORIEEN, CATEGORIE_INFO, type Categorie } from "@/lib/categorieen";

/**
 * Excel-sjabloon voor overstappen vanuit een spreadsheet of een ander pakket.
 * Kolommen: Datum | Omschrijving | Tegenpartij | Bedrag | Categorie | Btw
 */
export async function maakSjabloon(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Boekingen");
  ws.columns = [
    { header: "Datum", key: "datum", width: 12 },
    { header: "Omschrijving", key: "omschrijving", width: 40 },
    { header: "Tegenpartij", key: "tegenpartij", width: 28 },
    { header: "Bedrag (incl. btw, negatief = kosten)", key: "bedrag", width: 20 },
    { header: "Categorie", key: "categorie", width: 24 },
    { header: "Btw (21, 9, 0, geen, verlegd, eu_dienst)", key: "btw", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ datum: "2026-01-15", omschrijving: "Factuur 2026-0001", tegenpartij: "Klant BV", bedrag: 1210, categorie: "omzet", btw: "21" });
  ws.addRow({ datum: "2026-01-20", omschrijving: "Laptop", tegenpartij: "Coolblue", bedrag: -1452, categorie: "investering", btw: "21" });
  const uitleg = wb.addWorksheet("Categorieën");
  uitleg.columns = [{ header: "Code", key: "code", width: 24 }, { header: "Betekenis", key: "label", width: 40 }];
  uitleg.getRow(1).font = { bold: true };
  for (const c of CATEGORIEEN) uitleg.addRow({ code: c, label: CATEGORIE_INFO[c].label });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function importeerExcel(ondernemingId: string, bestand: Buffer): Promise<{ regels: number; overgeslagen: number; fouten: string[] }> {
  const uit = { regels: 0, overgeslagen: 0, fouten: [] as string[] };
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(bestand as unknown as ArrayBuffer); } catch { return { ...uit, fouten: ["Bestand is geen geldig .xlsx-bestand."] }; }
  const ws = wb.worksheets[0];
  if (!ws) return { ...uit, fouten: ["Geen werkblad gevonden."] };
  const kop = (ws.getRow(1).values as (string | undefined)[]).map((v) => String(v ?? "").toLowerCase());
  const idx = (re: RegExp) => kop.findIndex((h) => re.test(h));
  const iDatum = idx(/datum|date/), iOms = idx(/omschrijving|description/), iTegen = idx(/tegenpartij|naam|relatie/), iBedrag = idx(/bedrag|amount/), iCat = idx(/categorie/), iBtw = idx(/btw/);
  if (iDatum < 0 || iBedrag < 0) return { ...uit, fouten: ["Kolommen Datum en Bedrag zijn verplicht. Gebruik het sjabloon."] };

  const cel = (rij: ExcelJS.Row, i: number) => {
    if (i < 0) return "";
    const v = rij.getCell(i).value;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v && typeof v === "object" && "result" in v) return String((v as { result: unknown }).result ?? "");
    return String(v ?? "");
  };
  for (let r = 2; r <= ws.rowCount; r++) {
    const rij = ws.getRow(r);
    const d = datum(cel(rij, iDatum));
    const bedrag = getal(cel(rij, iBedrag));
    if (isNaN(d.getTime()) || !bedrag) { uit.overgeslagen++; continue; }
    const oms = cel(rij, iOms);
    const tegen = cel(rij, iTegen) || oms.slice(0, 40);
    const catRuw = cel(rij, iCat).trim().toLowerCase();
    const categorie = (CATEGORIEEN as string[]).includes(catRuw) ? (catRuw as Categorie) : null;
    const btwRuw = cel(rij, iBtw).trim().toLowerCase().replace("%", "");
    const btwCode = (BTW_CODES as readonly string[]).includes(btwRuw) ? btwRuw : null;
    const nieuw = await voegTransactieToe(ondernemingId, {
      datum: d, bedrag, tegenpartij: tegen || "Onbekend", omschrijving: oms, hash: maakHash(d, bedrag, tegen, oms, "excel"), bron: "import",
      categorie, btwCode, zakelijk: categorie ? categorie !== "prive" && categorie !== "overboeking_eigen" : null, bevestigd: !!categorie, zekerheid: categorie ? 1 : null, uitleg: categorie ? "Overgenomen uit Excel" : null,
    }).catch(() => 0);
    if (nieuw) uit.regels++; else uit.overgeslagen++;
  }
  return uit;
}
