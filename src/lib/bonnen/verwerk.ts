import { euro } from "@/lib/btw";
import { db } from "@/lib/db";
import { leesBon, type BonUitlezing, BOT_ONBEREIKBAAR } from "@/lib/ai";
import { foutTekst } from "@/lib/fout";
import { aiTegoed, AI_OP } from "@/lib/limiet";

/** Bestandstypes die we als bon accepteren. */
export const BON_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
export const BON_MAX_BYTES = 20 * 1024 * 1024;

/** Zoekt een bankregel bij een uitgelezen bon: zelfde bedrag ±0,01 binnen 14 dagen, anders op leveranciersnaam binnen 14 dagen. */
export async function zoekBankregel(ondernemingId: string, u: { datum: Date | null; totaal: number | null; leverancier: string | null }) {
  if (!u.datum || !u.totaal) return null;
  const van = new Date(u.datum.getTime() - 14 * 864e5);
  const tot = new Date(u.datum.getTime() + 14 * 864e5);
  const basis = { ondernemingId, bonId: null, datum: { gte: van, lte: tot } };
  const opBedrag = await db.transactie.findFirst({ where: { ...basis, bedrag: { gte: -u.totaal - 0.01, lte: -u.totaal + 0.01 } } });
  if (opBedrag) return opBedrag;
  const woord = (u.leverancier ?? "").split(/\s+/).find((w) => w.length >= 4);
  if (!woord) return null;
  return db.transactie.findFirst({ where: { ...basis, bedrag: { lt: 0 }, tegenpartij: { contains: woord, mode: "insensitive" } } });
}

export async function koppelBon(bonId: string, transactieId: string, u: { btwBedrag: number | null; btwCode: string | null; categorie: string | null; leverancier: string | null }) {
  await db.transactie.update({
    where: { id: transactieId },
    data: { bonId, btwBedrag: u.btwBedrag ?? undefined, btwCode: u.btwCode ?? undefined, categorie: u.categorie ?? undefined, zakelijk: true, bevestigd: true, zekerheid: 1, uitleg: `Bon gekoppeld: ${u.leverancier ?? "onbekend"}` },
  });
  await db.bon.update({ where: { id: bonId }, data: { status: "gekoppeld" } });
}

/** Uitlezing opslaan op de bon en, als er precies één passende bankregel is, koppelen. Geeft terug of er gekoppeld is. */
export async function verwerkUitlezing(bonId: string, ondernemingId: string, u: BonUitlezing) {
  const datum = u.datum ? new Date(u.datum) : null;
  const geldigeDatum = datum && !isNaN(datum.getTime()) ? datum : null;
  await db.bon.update({
    where: { id: bonId },
    data: {
      leverancier: u.leverancier, leverancierBtw: u.leverancierBtw || null, factuurnummer: u.factuurnummer || null,
      datum: geldigeDatum, totaal: u.totaal, btwBedrag: u.btwBedrag, btwCode: u.btwCode, categorie: u.categorie,
      valuta: u.valuta || "EUR", zekerheid: u.zekerheid, uitleg: u.uitleg, regelsJson: JSON.stringify(u.regels), status: "uitgelezen",
    },
  });
  const match = await zoekBankregel(ondernemingId, { datum: geldigeDatum, totaal: u.totaal, leverancier: u.leverancier });
  if (match) await koppelBon(bonId, match.id, u);
  return !!match;
}

export function bonFoutTekst(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/api key|apiKey|ANTHROPIC_API_KEY|authentication|401|overloaded|529|rate.?limit|429|timeout/i.test(m)) return BOT_ONBEREIKBAAR;
  return foutTekst(e);
}

/** Klopt de inhoud met het opgegeven type? (De browser of afzender bepaalt het type; de eerste bytes liegen niet.) */
export function klopType(data: Buffer, type: string): boolean {
  const b = data.subarray(0, 12);
  const begint = (...x: number[]) => x.every((v, i) => b[i] === v);
  switch (type) {
    case "application/pdf": return data.subarray(0, 1024).includes(Buffer.from("%PDF"));
    case "image/jpeg": return begint(0xff, 0xd8, 0xff);
    case "image/png": return begint(0x89, 0x50, 0x4e, 0x47);
    case "image/gif": return begint(0x47, 0x49, 0x46, 0x38);
    case "image/webp": return begint(0x52, 0x49, 0x46, 0x46) && b.subarray(8, 12).toString("latin1") === "WEBP";
    default: return false;
  }
}

/**
 * Eén bon opslaan (in de database), uitlezen en koppelen. Gebruikt door de webapp én de mobiele API.
 * Gooit niet: een leesfout komt terug als status "fout" op de bon.
 */
export async function bonUploaden(ondernemingId: string, bestand: { naam: string; type: string; data: Buffer }, bron = "upload") {
  if (bestand.data.length > BON_MAX_BYTES) throw new Error(`${bestand.naam}: groter dan 20 MB`);
  if (!BON_TYPES.includes(bestand.type) || !klopType(bestand.data, bestand.type)) throw new Error(`${bestand.naam}: alleen PDF, JPG, PNG, WEBP of GIF`);
  const bon = await db.bon.create({ data: { ondernemingId, bestandsnaam: bestand.naam, mimeType: bestand.type, bestandsPad: "", inhoud: new Uint8Array(bestand.data), bron } });
  try {
    const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { demoTot: true } });
    if (!(await aiTegoed(ondernemingId, Boolean(o?.demoTot)))) throw new Error(AI_OP);
    const u = await leesBon(bestand.data, bestand.type, ondernemingId);
    const gekoppeld = await verwerkUitlezing(bon.id, ondernemingId, u);
    return { bonId: bon.id, ok: true as const, gekoppeld, uitlezing: u, melding: `${u.leverancier} ${(!u.valuta || u.valuta === "EUR") ? euro(u.totaal) : `${u.totaal.toFixed(2).replace(".", ",")} ${u.valuta}`}: ${gekoppeld ? "gelezen en aan de betaling gehangen" : "gelezen; de betaling zien we nog niet bij de bank"}` };
  } catch (e) {
    const fout = bonFoutTekst(e);
    // Bot even niet bereikbaar of daglimiet op: de bon is niet onleesbaar. Bewaren als "nog niet gelezen";
    // de dagtaak (of "Opnieuw lezen") leest hem later.
    if (fout === BOT_ONBEREIKBAAR || fout === AI_OP) {
      await db.bon.update({ where: { id: bon.id }, data: { status: "nieuw", uitleg: LATER_LEZEN } });
      return { bonId: bon.id, ok: true as const, gekoppeld: false, uitlezing: null, melding: `${bestand.naam}: bewaard. ${LATER_LEZEN}` };
    }
    await db.bon.update({ where: { id: bon.id }, data: { status: "fout", uitleg: fout } });
    return { bonId: bon.id, ok: false as const, gekoppeld: false, uitlezing: null, melding: `${bestand.naam}: ${fout}` };
  }
}

export const LATER_LEZEN = "Lezen lukt nu even niet; Saldoplan doet het later vanzelf.";

/** Bonnen die nog niet gelezen zijn (bot was onbereikbaar) opnieuw proberen; voor de dagtaak. Stopt bij de eerste storing. */
export async function leesOpenBonnen(ondernemingId: string, max = 20): Promise<{ gelezen: number; open: number }> {
  const open = await db.bon.findMany({ where: { ondernemingId, status: "nieuw", aangemaakt: { lt: new Date(Date.now() - 10 * 60_000) } }, orderBy: { aangemaakt: "asc" }, take: max });
  const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { demoTot: true } });
  let gelezen = 0;
  for (const bon of open) {
    if (!bon.inhoud) continue;
    try {
      if (!(await aiTegoed(ondernemingId, Boolean(o?.demoTot)))) break;
      const u = await leesBon(Buffer.from(bon.inhoud), bon.mimeType, ondernemingId);
      await verwerkUitlezing(bon.id, ondernemingId, u);
      gelezen++;
    } catch (e) {
      const fout = bonFoutTekst(e);
      if (fout === BOT_ONBEREIKBAAR) break;
      await db.bon.update({ where: { id: bon.id }, data: { status: "fout", uitleg: fout } });
    }
  }
  return { gelezen, open: open.length - gelezen };
}
