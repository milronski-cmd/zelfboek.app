import { zipSync, strToU8 } from "fflate";
import { db } from "@/lib/db";
import { excelExport } from "./excel";
import { factuurPdf } from "@/lib/facturen/pdf";

/**
 * Al je gegevens in één zip (recht op inzage en overdraagbaarheid, AVG): alles als JSON, je bonnen als originele
 * bestanden, je facturen als PDF en per boekjaar een Excel-werkboek. Geen geheimen (sleutels van koppelingen, tweestap).
 */
export async function allesExport(ondernemingId: string): Promise<Uint8Array> {
  const w = { where: { ondernemingId } };
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } });
  const [rekeningen, transacties, bonnen, klanten, producten, facturen, offertes, terugkerend, uren, km, activa, memoriaal, boekingen, aangiften, meldingen, taken, logboek, leden, koppelingen] = await Promise.all([
    db.bankrekening.findMany({ ...w, select: { id: true, naam: true, iban: true, bank: true, bron: true, saldo: true } }),
    db.transactie.findMany({ ...w, orderBy: { datum: "asc" } }),
    db.bon.findMany({ ...w, omit: { inhoud: true } }),
    db.klant.findMany(w), db.product.findMany(w), db.factuur.findMany({ ...w, include: { klant: true, onderneming: true }, orderBy: { datum: "asc" } }), db.offerte.findMany(w),
    db.terugkerendeFactuur.findMany(w), db.urenregel.findMany(w), db.kilometerregel.findMany(w), db.activum.findMany(w), db.memoriaalboeking.findMany(w), db.boekingsregel.findMany(w),
    db.aangifte.findMany(w), db.melding.findMany(w), db.taak.findMany(w), db.logboek.findMany(w),
    db.lidmaatschap.findMany({ ...w, select: { rol: true, gebruiker: { select: { email: true, naam: true } } } }),
    db.koppeling.findMany({ ...w, select: { soort: true, status: true, naam: true, aangemaakt: true } }),
  ]);
  const { logo: _logo, ...onderneming } = o;
  void _logo;
  const json = {
    uitleg: "Alle gegevens van je onderneming in Saldoplan. Bedragen in euro's; datums in UTC. Sleutels van koppelingen staan er bewust niet in.",
    gemaakt: new Date().toISOString(),
    onderneming, leden, koppelingen, rekeningen, transacties, bonnen, klanten, producten,
    facturen: facturen.map(({ onderneming: _o, ...f }) => { void _o; return f; }),
    offertes, terugkerend, uren, kilometers: km, activa, memoriaal, boekingsregels: boekingen, aangiften, meldingen, taken, logboek,
  };
  const bestanden: Record<string, Uint8Array> = { "gegevens.json": strToU8(JSON.stringify(json, null, 2)) };

  const veilig = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  for (const b of bonnen) {
    const r = await db.bon.findUnique({ where: { id: b.id }, select: { inhoud: true } });
    if (r?.inhoud) bestanden[`bonnen/${b.id.slice(-6)}-${veilig(b.bestandsnaam)}`] = new Uint8Array(r.inhoud);
  }
  for (const f of facturen) {
    try { bestanden[`facturen/${veilig(f.nummer)}.pdf`] = new Uint8Array(await factuurPdf(f)); } catch { /* een kapotte factuur houdt de rest niet tegen */ }
  }
  const jaren = new Set(transacties.map((t) => t.datum.getFullYear()).concat(facturen.map((f) => f.datum.getFullYear())));
  if (jaren.size === 0) jaren.add(new Date().getFullYear());
  for (const j of [...jaren].sort()) {
    try { bestanden[`excel/administratie-${j}.xlsx`] = new Uint8Array(await excelExport(ondernemingId, j)); } catch { /* idem */ }
  }
  return zipSync(bestanden, { level: 6 });
}
