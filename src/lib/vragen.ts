import { db } from "./db";
import { euro } from "./btw";
import { CATEGORIE_INFO } from "./categorieen";

const categorieLabel = (c: string | null) => (c && c in CATEGORIE_INFO ? CATEGORIE_INFO[c as keyof typeof CATEGORIE_INFO].label.toLowerCase() : "overige kosten");

/**
 * De vragen van Saldoplan aan de ondernemer ("zakelijk of privé?"), op één plek.
 * Betalingen aan dezelfde winkel worden één vraag: één antwoord geldt voor allemaal.
 * Een taak die hetzelfde vraagt (bijvoorbeeld van de assistent) telt niet als extra vraag.
 */

/** Winkelnaam zonder filiaalnummer, rechtsvorm of leestekens: "Albert Heijn 1403" en "ALBERT HEIJN" worden "albert heijn". */
export function winkelSleutel(naam: string): string {
  return naam
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(b\.?v\.?|n\.?v\.?|vof|ltd|gmbh|inc|bv)\b/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Vraag = {
  sleutel: string;
  tegenpartij: string;
  ids: string[];
  bedragen: number[];
  totaal: number;
  eerste: Date;
  laatste: Date;
  omschrijving: string;
  uitleg: string | null;
  voorstelZakelijk: boolean | null;
  categorie: string | null;
  zekerheid: number;
};

export async function openVragen(ondernemingId: string): Promise<Vraag[]> {
  const rijen = await db.transactie.findMany({
    where: { ondernemingId, bevestigd: false, zakelijk: { not: null } },
    orderBy: { datum: "desc" },
    take: 500,
    select: { id: true, tegenpartij: true, bedrag: true, datum: true, omschrijving: true, uitleg: true, zakelijk: true, categorie: true, zekerheid: true },
  });
  const groepen = new Map<string, Vraag>();
  for (const r of rijen) {
    const sleutel = winkelSleutel(r.tegenpartij || "onbekend") || r.id;
    const g = groepen.get(sleutel);
    if (g) {
      g.ids.push(r.id);
      g.bedragen.push(r.bedrag);
      g.totaal += r.bedrag;
      if (r.datum < g.eerste) g.eerste = r.datum;
      continue;
    }
    groepen.set(sleutel, {
      sleutel, tegenpartij: r.tegenpartij || "Onbekend", ids: [r.id], bedragen: [r.bedrag], totaal: r.bedrag,
      eerste: r.datum, laatste: r.datum, omschrijving: r.omschrijving, uitleg: r.uitleg, voorstelZakelijk: r.zakelijk,
      categorie: r.categorie, zekerheid: r.zekerheid ?? 0,
    });
  }
  return [...groepen.values()];
}

/** Vraagt deze taak hetzelfde als een open vraag (zakelijk of privé over dezelfde winkel)? Dan tonen we hem niet apart. */
export function isDubbeleVraag(titel: string, vragen: { sleutel: string }[]): boolean {
  if (!/zakelijk|priv[eé]/i.test(titel)) return false;
  const t = ` ${winkelSleutel(titel)} `;
  return vragen.some((v) => v.sleutel.length >= 3 && t.includes(` ${v.sleutel} `));
}

/** Na een antwoord: taken die hetzelfde vroegen afvinken. */
export async function sluitDubbeleTaken(ondernemingId: string, sleutel: string) {
  const taken = await db.taak.findMany({ where: { ondernemingId, klaar: false }, select: { id: true, titel: true } });
  const dubbel = taken.filter((t) => isDubbeleVraag(t.titel, [{ sleutel }])).map((t) => t.id);
  if (dubbel.length) await db.taak.updateMany({ where: { id: { in: dubbel } }, data: { klaar: true } });
}

/** Kaartjes voor het scherm: bedragen en datum als gewone tekst, voorstel van Saldoplan in gewone woorden. */
export function naarKaarten(vragen: Vraag[]): import("@/components/Vragen").VraagKaart[] {
  const kort = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).replace(".", "");
  return vragen.map((v) => ({
    sleutel: v.sleutel,
    tegenpartij: v.tegenpartij,
    ids: v.ids,
    bedragTekst: v.ids.length > 1 ? `${v.ids.length}× samen ${euro(v.totaal)}` : euro(v.totaal),
    datumTekst: v.ids.length > 1 ? `${kort(v.eerste)} tot ${kort(v.laatste)}` : kort(v.laatste),
    omschrijving: v.ids.length > 1 ? "" : v.omschrijving,
    voorstel: v.voorstelZakelijk === false ? "privé" : `zakelijk, ${categorieLabel(v.categorie)}`,
    uitleg: v.uitleg,
  }));
}
