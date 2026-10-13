import Papa from "papaparse";
import { db } from "@/lib/db";
import { voegTransactieToe } from "@/lib/bank/importeer";
import { datum, getal, maakHash } from "@/lib/bank/csv";
import { CATEGORIEEN } from "@/lib/categorieen";

/**
 * Overstappen vanuit Jortt via de CSV-exports (Instellingen → Exporteren):
 * - klanten.csv (Naam, E-mail, Adres, Postcode, Plaats, Land, KvK, Btw-nummer)
 * - boekingen.csv / transacties.csv (Datum, Omschrijving, Bedrag, Categorie/Grootboek, Btw)
 * Het type wordt aan de kolommen herkend.
 */
export async function importeerJorttCsv(ondernemingId: string, tekst: string): Promise<{ klanten: number; regels: number; fouten: string[] }> {
  const uit = { klanten: 0, regels: 0, fouten: [] as string[] };
  const { data } = Papa.parse<Record<string, string>>(tekst.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  if (data.length === 0) return { ...uit, fouten: ["Leeg of onleesbaar CSV-bestand."] };
  const kolommen = Object.keys(data[0]);
  const k = (r: Record<string, string>, re: RegExp) => { const key = kolommen.find((x) => re.test(x.trim())); return key ? (r[key] ?? "").trim() : ""; };

  if (kolommen.some((x) => /^(naam|bedrijfsnaam|klantnaam)$/i.test(x)) && !kolommen.some((x) => /bedrag/i.test(x))) {
    for (const r of data) {
      const naam = k(r, /^(naam|bedrijfsnaam|klantnaam)$/i);
      if (!naam) continue;
      const bestaat = await db.klant.findFirst({ where: { ondernemingId, naam } });
      if (bestaat) continue;
      await db.klant.create({
        data: { ondernemingId, naam, email: k(r, /e-?mail/i) || null, adres: k(r, /^(adres|straat)/i) || null, postcode: k(r, /postcode/i) || null, plaats: k(r, /^(plaats|woonplaats|stad)$/i) || null, land: k(r, /^land$/i) || "NL", kvk: k(r, /kvk/i) || null, btwNummer: k(r, /btw/i) || null, externId: `jortt:${naam}` },
      });
      uit.klanten++;
    }
    return uit;
  }

  for (const r of data) {
    const d = datum(k(r, /datum|date/i));
    const bedrag = getal(k(r, /^bedrag( incl.*)?$|totaal/i));
    if (isNaN(d.getTime()) || !bedrag) continue;
    const oms = k(r, /omschrijving|beschrijving|description/i);
    const tegen = k(r, /relatie|klant|leverancier|tegenpartij|naam/i) || oms.slice(0, 40);
    const catRuw = k(r, /categorie|grootboek|rubriek/i).toLowerCase();
    const categorie = CATEGORIEEN.find((c) => catRuw.includes(c)) ?? (/omzet|verkoop/i.test(catRuw) ? "omzet" : /priv/i.test(catRuw) ? "prive" : null);
    const btwRuw = k(r, /btw.?(tarief|percentage|%)|^btw$/i);
    const btwCode = /21/.test(btwRuw) ? "21" : /9/.test(btwRuw) ? "9" : /verlegd/i.test(btwRuw) ? "verlegd" : /0|geen|vrij/i.test(btwRuw) ? "geen" : null;
    const nieuw = await voegTransactieToe(ondernemingId, {
      datum: d, bedrag, tegenpartij: tegen || "Onbekend", omschrijving: oms, hash: maakHash(d, bedrag, tegen, oms, "jortt"), bron: "import",
      categorie, btwCode, zakelijk: categorie ? categorie !== "prive" : null, bevestigd: !!categorie, zekerheid: categorie ? 1 : null, uitleg: categorie ? "Overgenomen uit Jortt" : null,
    }).catch(() => 0);
    uit.regels += nieuw;
  }
  return uit;
}
