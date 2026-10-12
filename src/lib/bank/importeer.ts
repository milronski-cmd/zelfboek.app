import { db } from "@/lib/db";
import { winkelSleutel } from "@/lib/vragen";
import { beoordeelTransacties, BOT_ONBEREIKBAAR } from "@/lib/ai";
import { btwUitInclusief } from "@/lib/btw";
import { parseBankCsv, type BankRegel, type ParseResultaat } from "./csv";
import { parseMt940 } from "./mt940";
import { parseCamt053 } from "./camt053";
import { letterAutomatischAf } from "@/lib/facturen/betaling";

/** Herkent het bestandstype aan de inhoud en parseert. */
export function parseBankbestand(tekst: string, bestandsnaam = ""): ParseResultaat {
  const kop = tekst.slice(0, 2000);
  if (/<\?xml|<Document/i.test(kop) && /BkToCstmr(Stmt|AcctRpt)|camt\.05[23]/i.test(kop)) return parseCamt053(tekst);
  if (/^:20:|\n:20:|:61:|:25:/.test(kop) || /\.(sta|940|mt940|swi)$/i.test(bestandsnaam)) return parseMt940(tekst);
  return parseBankCsv(tekst);
}

export type ImportUitkomst = { nieuw: number; dubbel: number; bankrekeningId: string | null; beoordeeld: number; aiFout?: string };

/**
 * Schrijft bankregels naar Transactie, maakt of vindt de bankrekening op IBAN, slaat dubbelen over (hash)
 * en laat de AI alle nog niet beoordeelde regels boeken.
 */
export async function importeerRegels(
  ondernemingId: string,
  regels: BankRegel[],
  opties: { bron: string; bank?: string; eigenIban?: string; bankrekeningId?: string; beoordeel?: boolean } ,
): Promise<ImportUitkomst> {
  let bankrekeningId = opties.bankrekeningId ?? null;
  const iban = opties.eigenIban ?? regels.find((r) => r.eigenIban)?.eigenIban;
  if (!bankrekeningId && iban) {
    const rek = await db.bankrekening.upsert({
      where: { ondernemingId_iban: { ondernemingId, iban } },
      update: { bank: opties.bank ?? undefined },
      create: { ondernemingId, iban, naam: `${opties.bank ?? "Bank"} ${iban.slice(-4)}`, bank: opties.bank, bron: opties.bron },
    });
    bankrekeningId = rek.id;
  }

  let nieuw = 0;
  for (const r of regels) {
    const res = await db.transactie
      .createMany({
        data: [{
          ondernemingId,
          bankrekeningId,
          datum: r.datum,
          bedrag: r.bedrag,
          tegenpartij: r.tegenpartij || "Onbekend",
          tegenIban: r.tegenIban ?? null,
          omschrijving: r.omschrijving,
          hash: r.hash,
          bron: opties.bron,
        }],
      })
      .catch((e: unknown) => { if ((e as { code?: string })?.code === "P2002") return { count: 0 }; throw e; });
    nieuw += res.count;
  }
  if (bankrekeningId) await db.bankrekening.update({ where: { id: bankrekeningId }, data: { laatsteSync: new Date() } });

  let beoordeeld = 0;
  let aiFout: string | undefined;
  if (opties.beoordeel !== false && nieuw > 0) {
    const uit = await beoordeelOpenstaand(ondernemingId);
    beoordeeld = uit.beoordeeld;
    aiFout = uit.fout;
  }
  return { nieuw, dubbel: regels.length - nieuw, bankrekeningId, beoordeeld, aiFout };
}

/** Eerdere handmatige keuzes van de ondernemer, zodat de AI die volgt. */
async function eerdereKeuzes(ondernemingId: string): Promise<string[]> {
  const rijen = await db.transactie.findMany({
    where: { ondernemingId, bevestigd: true, OR: [{ uitleg: { startsWith: "Handmatig" } }, { uitleg: { startsWith: "Door jou" } }, { uitleg: { startsWith: VASTE_KEUZE } }] },
    orderBy: { aangemaakt: "desc" },
    take: 30,
    select: { tegenpartij: true, categorie: true, btwCode: true, zakelijk: true },
  });
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const r of rijen) {
    const k = r.tegenpartij.toLowerCase();
    if (gezien.has(k)) continue;
    gezien.add(k);
    uit.push(`${r.tegenpartij} → ${r.zakelijk ? `${r.categorie}/${r.btwCode}` : "privé"}`);
  }
  return uit;
}

/** Uitleg-begin van een boeking die de ondernemer als vaste keuze koos ("Altijd zo voor deze winkel"). */
export const VASTE_KEUZE = "Vaste keuze";

/**
 * "Altijd zo voor deze winkel": open en twijfelende betalingen aan een winkel met een vaste keuze
 * meteen zo boeken, zonder AI en zonder vraag. De keuze staat in de uitleg van de gekozen boeking.
 */
export async function pasVasteKeuzesToe(ondernemingId: string, alleenSleutel?: string): Promise<number> {
  const vast = await db.transactie.findMany({
    where: { ondernemingId, uitleg: { startsWith: VASTE_KEUZE } },
    orderBy: { datum: "desc" },
    take: 1000,
    select: { tegenpartij: true, zakelijk: true, categorie: true, btwCode: true, priveDeel: true },
  });
  const keuzes = new Map<string, (typeof vast)[number]>();
  for (const v of vast) { const k = winkelSleutel(v.tegenpartij); if (k && !keuzes.has(k)) keuzes.set(k, v); }
  if (keuzes.size === 0) return 0;
  const open = await db.transactie.findMany({
    where: { ondernemingId, OR: [{ zakelijk: null }, { bevestigd: false }] },
    select: { id: true, tegenpartij: true, bedrag: true },
  });
  let n = 0;
  for (const t of open) {
    const k = winkelSleutel(t.tegenpartij);
    if (alleenSleutel && k !== alleenSleutel) continue;
    const v = keuzes.get(k);
    if (!v || v.zakelijk === null) continue;
    await db.transactie.update({
      where: { id: t.id },
      data: {
        zakelijk: v.zakelijk, categorie: v.zakelijk ? v.categorie ?? "overig" : "prive", btwCode: v.zakelijk ? v.btwCode ?? "21" : "geen",
        btwBedrag: v.zakelijk ? btwUitInclusief(Math.abs(t.bedrag), v.btwCode ?? "21") : 0,
        priveDeel: v.zakelijk ? v.priveDeel : 0,
        bevestigd: true, zekerheid: 1, uitleg: `${VASTE_KEUZE}: altijd ${v.zakelijk ? (v.priveDeel > 0 ? `${Math.round((1 - v.priveDeel) * 100)}% zakelijk` : "zakelijk") : "privé"} bij ${t.tegenpartij}`,
      },
    });
    n++;
  }
  return n;
}

/** Alle nog niet beoordeelde transacties in porties van 40 door de AI halen. */
export async function beoordeelOpenstaand(ondernemingId: string, max = 400): Promise<{ beoordeeld: number; fout?: string }> {
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } });
  await letterAutomatischAf(ondernemingId).catch(() => 0);
  const vast = await pasVasteKeuzesToe(ondernemingId);
  const open = await db.transactie.findMany({
    where: { ondernemingId, zakelijk: null },
    orderBy: { datum: "asc" },
    take: max,
  });
  if (open.length === 0) return { beoordeeld: vast };
  const keuzes = await eerdereKeuzes(ondernemingId);
  let klaar = 0;
  try {
    for (let i = 0; i < open.length; i += 40) {
      const portie = open.slice(i, i + 40);
      const uitkomst = await beoordeelTransacties(
        portie.map((t) => ({
          id: t.id,
          datum: t.datum.toISOString().slice(0, 10),
          bedrag: t.bedrag,
          tegenpartij: t.tegenpartij,
          omschrijving: t.omschrijving,
          bron: t.bron,
        })),
        { naam: o.naam, branche: o.branche, eerdereKeuzes: keuzes },
      );
      for (const b of uitkomst) {
        const t = portie.find((x) => x.id === b.id);
        if (!t) continue;
        await db.transactie.update({
          where: { id: t.id },
          data: {
            zakelijk: b.zakelijk,
            categorie: b.categorie,
            btwCode: b.btwCode,
            btwBedrag: b.zakelijk ? btwUitInclusief(Math.abs(t.bedrag), b.btwCode) : 0,
            zekerheid: b.zekerheid,
            uitleg: b.uitleg,
            bevestigd: b.zekerheid >= o.zekerheidsgrens, // per klant: voorzichtig (vaker vragen) of snel
          },
        });
        klaar++;
      }
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { beoordeeld: klaar, fout: /api key|authentication|401/i.test(m) ? BOT_ONBEREIKBAAR : m };
  }
  return { beoordeeld: klaar + vast };
}
