import type { Onderneming } from "@prisma/client";
import { db } from "./db";
import { btwAangifte, periodeBereik } from "./btw";
import { sbrBtwAangifte } from "./exports/sbr";
import { factuurUbl } from "./facturen/ubl";

/**
 * Klaargezet: rechtstreeks versturen naar de overheid en via Peppol. Gaat aan met env-variabelen;
 * zonder staat de knop niet in beeld en blijft de handmatige route (bedragen overnemen, PDF/UBL mailen).
 *
 * Btw indienen loopt via een hub/intermediair (Logius noemt dat de minst bewerkelijke route naar Digipoort):
 *   DIGIPOORT_HUB_URL  adres waar we het SBR-bestand (XBRL) heen sturen
 *   DIGIPOORT_HUB_KEY  sleutel van de hub
 * Verwacht antwoord: JSON met een kenmerk ({ kenmerk } of { id }). Pas dit aan op de gekozen hub.
 *
 * Peppol loopt via een access point (bijvoorbeeld e-invoice.be of Storecove):
 *   PEPPOL_API_URL     adres om een UBL-factuur te versturen
 *   PEPPOL_API_KEY     sleutel van het access point
 * We sturen de UBL (XML) met de ontvanger in de kop X-Peppol-Receiver (0106:KvK of 9944:btw-nummer).
 */
export const digipoortAan = () => Boolean(process.env.DIGIPOORT_HUB_URL && process.env.DIGIPOORT_HUB_KEY);
export const peppolAan = () => Boolean(process.env.PEPPOL_API_URL && process.env.PEPPOL_API_KEY);

export async function dienBtwIn(o: Onderneming, jaar: number, periode: number): Promise<string> {
  if (!digipoortAan()) throw new Error("Rechtstreeks indienen staat nog niet aan.");
  const btwId = o.btwId ?? o.btwNummer;
  if (!btwId) throw new Error("Vul eerst je btw-identificatienummer in bij Instellingen.");
  const tijdvak = o.btwTijdvak as "maand" | "kwartaal" | "jaar";
  const { start, eind } = periodeBereik(tijdvak, jaar, periode || 1);
  const regels = await db.transactie.findMany({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, select: { bedrag: true, btwCode: true, btwBedrag: true, zakelijk: true, categorie: true, priveDeel: true } });
  const xbrl = sbrBtwAangifte({ aangifte: btwAangifte(regels), btwId, naam: o.naam, jaar, tijdvak, periode, contact: { naam: o.naam, telefoon: o.telefoon ?? undefined } });
  const r = await fetch(process.env.DIGIPOORT_HUB_URL!, { method: "POST", headers: { Authorization: `Bearer ${process.env.DIGIPOORT_HUB_KEY}`, "Content-Type": "application/xml" }, body: xbrl });
  const t = await r.text();
  if (!r.ok) throw new Error(`Indienen is niet gelukt (${r.status}). Probeer het later opnieuw of doe de aangifte zelf.`);
  try { const j = JSON.parse(t) as { kenmerk?: string; id?: string }; return j.kenmerk ?? j.id ?? "ontvangen"; } catch { return "ontvangen"; }
}

/** Peppol-id van een zakelijke klant: KvK (0106) of btw-nummer (9944). */
export function peppolId(k: { kvk: string | null; btwNummer: string | null; land: string }): string | null {
  if (k.kvk && /^\d{8}$/.test(k.kvk)) return `0106:${k.kvk}`;
  if (k.btwNummer) return `9944:${k.btwNummer.replace(/\s/g, "").toUpperCase()}`;
  return null;
}

export async function verstuurPeppol(factuurId: string, ondernemingId: string): Promise<void> {
  if (!peppolAan()) throw new Error("Peppol staat nog niet aan.");
  const f = await db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId }, include: { klant: true, onderneming: true } });
  const ontvanger = peppolId(f.klant);
  if (!ontvanger) throw new Error("Vul het KvK- of btw-nummer van de klant in; daarmee vindt Peppol de klant.");
  const ubl = await factuurUbl(f);
  const r = await fetch(process.env.PEPPOL_API_URL!, { method: "POST", headers: { Authorization: `Bearer ${process.env.PEPPOL_API_KEY}`, "Content-Type": "application/xml", "X-Peppol-Receiver": ontvanger }, body: ubl });
  if (!r.ok) throw new Error(`Versturen via Peppol is niet gelukt (${r.status}). Kan de klant geen e-facturen ontvangen? Verstuur dan per mail.`);
  await db.factuur.update({ where: { id: f.id }, data: { status: f.status === "concept" ? "verzonden" : f.status, verzondenOp: f.verzondenOp ?? new Date() } });
  await db.melding.create({ data: { ondernemingId, soort: "systeem", titel: `Factuur ${f.nummer} verstuurd via Peppol`, tekst: `Naar ${f.klant.naam} (${ontvanger}).`, link: `/app/facturen/${f.id}` } });
}
