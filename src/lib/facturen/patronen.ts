import { db } from "@/lib/db";
import { parseRegels } from "./bereken";
import { perMaandFactor, volgendeDatum } from "./planning";

export type Voorstel = {
  sleutel: string;
  klant: string;
  omschrijving: string;
  bedrag: number; // zonder btw, per keer
  interval: "week" | "maand" | "kwartaal";
  aantal: number;
  eerste: Date;
  laatsteFactuurId: string;
  volgendeOp: Date;
};

/**
 * Facturen die je met de hand steeds opnieuw maakt: zelfde klant, zelfde bedrag, vast ritme.
 * Daar stelt Saldoplan een vaste factuur voor. Minstens drie keer, en het ritme moet nog lopen.
 */
export async function vindVastePatronen(ondernemingId: string, genegeerd: string[] = []): Promise<Voorstel[]> {
  const nu = new Date();
  const [facturen, vast] = await Promise.all([
    db.factuur.findMany({
      where: { ondernemingId, soort: "factuur", terugkerendId: null, status: { notIn: ["concept", "gecrediteerd"] }, datum: { gte: new Date(nu.getTime() - 400 * 864e5) } },
      select: { id: true, klantId: true, datum: true, subtotaal: true, regels: true, referentie: true, klant: { select: { naam: true } } },
      orderBy: { datum: "asc" },
    }),
    db.terugkerendeFactuur.findMany({ where: { ondernemingId }, select: { klantId: true, regels: true } }),
  ]);

  const sleutel = (klantId: string, bedrag: number) => `${klantId}:${bedrag.toFixed(2)}`;
  const bestaat = new Set(vast.map((t) => sleutel(t.klantId, parseRegels(t.regels).reduce((s, r) => s + r.aantal * r.prijs, 0))));
  const groepen = new Map<string, typeof facturen>();
  for (const f of facturen) {
    const k = sleutel(f.klantId, f.subtotaal);
    groepen.set(k, [...(groepen.get(k) ?? []), f]);
  }

  const uit: Voorstel[] = [];
  for (const [k, lijst] of groepen) {
    if (lijst.length < 3 || bestaat.has(k) || genegeerd.includes(k)) continue;
    const gaten = lijst.slice(1).map((f, i) => (f.datum.getTime() - lijst[i].datum.getTime()) / 864e5);
    const mediaan = [...gaten].sort((a, b) => a - b)[Math.floor(gaten.length / 2)];
    const interval = mediaan >= 6 && mediaan <= 8 ? "week" : mediaan >= 26 && mediaan <= 35 ? "maand" : mediaan >= 85 && mediaan <= 97 ? "kwartaal" : null;
    // Elk gat moet in de buurt van het ritme liggen, anders is het toeval.
    if (!interval || gaten.some((g) => Math.abs(g - mediaan) > mediaan * 0.35)) continue;
    const laatste = lijst[lijst.length - 1];
    // Gestopt patroon (langer dan twee keer het ritme niets meer gestuurd): niet voorstellen.
    if (nu.getTime() - laatste.datum.getTime() > (2 * mediaan + 7) * 864e5) continue;
    let volgendeOp = volgendeDatum(laatste.datum, interval);
    while (volgendeOp < nu) volgendeOp = volgendeDatum(volgendeOp, interval);
    uit.push({
      sleutel: k,
      klant: laatste.klant.naam,
      omschrijving: laatste.referentie || parseRegels(laatste.regels)[0]?.omschrijving || "Vaste factuur",
      bedrag: laatste.subtotaal,
      interval,
      aantal: lijst.length,
      eerste: lijst[0].datum,
      laatsteFactuurId: laatste.id,
      volgendeOp,
    });
  }
  return uit.sort((a, b) => b.bedrag * perMaandFactor[b.interval] - a.bedrag * perMaandFactor[a.interval]).slice(0, 3);
}
