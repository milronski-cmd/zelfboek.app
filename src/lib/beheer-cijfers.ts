import { db } from "./db";

/**
 * Cijfers voor beheer, alleen uit onze eigen database (de Stripe-status komt via de webhook binnen).
 * Voorbeeldomgevingen (demo) tellen nergens mee. Geen schattingen: wat we niet weten heet "onbekend".
 */

const DAG = 864e5;
const geenDemo = { demoTot: null };

function dagSleutel(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Maandag (UTC) van de week waar d in valt. */
function weekBegin(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dag = (x.getUTCDay() + 6) % 7;
  return new Date(x.getTime() - dag * DAG);
}

export function telPerDag(datums: Date[], dagen: number, nu = new Date()): { dag: string; aantal: number }[] {
  const uit: { dag: string; aantal: number }[] = [];
  const telling = new Map<string, number>();
  for (const d of datums) telling.set(dagSleutel(d), (telling.get(dagSleutel(d)) ?? 0) + 1);
  for (let i = dagen - 1; i >= 0; i--) {
    const k = dagSleutel(new Date(nu.getTime() - i * DAG));
    uit.push({ dag: k, aantal: telling.get(k) ?? 0 });
  }
  return uit;
}

export function telPerWeek(datums: Date[], weken: number, nu = new Date()): { week: string; aantal: number }[] {
  const telling = new Map<string, number>();
  for (const d of datums) {
    const k = dagSleutel(weekBegin(d));
    telling.set(k, (telling.get(k) ?? 0) + 1);
  }
  const deze = weekBegin(nu);
  const uit: { week: string; aantal: number }[] = [];
  for (let i = weken - 1; i >= 0; i--) {
    const k = dagSleutel(new Date(deze.getTime() - i * 7 * DAG));
    uit.push({ week: k, aantal: telling.get(k) ?? 0 });
  }
  return uit;
}

/** AI-kosten in dollars uit tokens, alleen als de prijs per miljoen tokens in de omgeving staat (AI_PRIJS_INVOER_PER_MTOK, AI_PRIJS_UITVOER_PER_MTOK). */
export function aiKosten(invoerTokens: number, uitvoerTokens: number): number | null {
  const pIn = Number(process.env.AI_PRIJS_INVOER_PER_MTOK);
  const pUit = Number(process.env.AI_PRIJS_UITVOER_PER_MTOK);
  if (!(pIn > 0) || !(pUit > 0)) return null;
  return (invoerTokens * pIn + uitvoerTokens * pUit) / 1e6;
}

export async function beheerCijfers(nu = new Date()) {
  const sinds30 = new Date(nu.getTime() - 30 * DAG);
  const sinds7 = new Date(nu.getTime() - 7 * DAG);
  const sinds56 = new Date(nu.getTime() - 56 * DAG);

  const [aanmeldingen, totaalOndernemingen, perStatus, betaaldOoit, gestopt30, gestoptTotaal, actief7, actief30, mrrRijen, aiPerKlant, proevenAflopend] = await Promise.all([
    db.onderneming.findMany({ where: { ...geenDemo, aangemaakt: { gte: sinds56 } }, select: { aangemaakt: true } }),
    db.onderneming.count({ where: geenDemo }),
    db.onderneming.groupBy({ by: ["abonnement"], where: geenDemo, _count: { _all: true } }),
    db.onderneming.count({ where: { ...geenDemo, betaaldSinds: { not: null } } }),
    db.onderneming.count({ where: { ...geenDemo, gestoptOp: { gte: sinds30 } } }),
    db.onderneming.count({ where: { ...geenDemo, abonnement: "gestopt" } }),
    db.gebruiker.count({ where: { laatstActief: { gte: sinds7 }, lidmaatschappen: { some: { onderneming: geenDemo } } } }),
    db.gebruiker.count({ where: { laatstActief: { gte: sinds30 }, lidmaatschappen: { some: { onderneming: geenDemo } } } }),
    db.onderneming.findMany({ where: { ...geenDemo, abonnement: { in: ["actief", "achterstallig"] } }, select: { stripeStatus: true, maandBedragCent: true } }),
    db.aiVerbruik.groupBy({ by: ["ondernemingId"], where: { dag: { gte: sinds30 } }, _sum: { verzoeken: true, invoerTokens: true, uitvoerTokens: true, limietGeraakt: true }, orderBy: { _sum: { invoerTokens: "desc" } }, take: 25 }),
    db.onderneming.count({ where: { ...geenDemo, abonnement: "proef", proefTot: { gte: nu, lte: new Date(nu.getTime() + 7 * DAG) } } }),
  ]);

  const status = Object.fromEntries(perStatus.map((r) => [r.abonnement, r._count._all])) as Record<string, number>;
  // MRR: alleen abonnementen die Stripe als "active" meldt en waarvan we het maandbedrag kennen.
  const betalend = mrrRijen.filter((r) => r.stripeStatus === "active");
  const mrrCent = betalend.reduce((s, r) => s + (r.maandBedragCent ?? 0), 0);
  const zonderBedrag = betalend.filter((r) => r.maandBedragCent == null).length;
  const inProefBijStripe = mrrRijen.filter((r) => r.stripeStatus === "trialing").length;

  const namen = new Map((await db.onderneming.findMany({ where: { id: { in: aiPerKlant.map((a) => a.ondernemingId) } }, select: { id: true, naam: true, leden: { where: { rol: "eigenaar" }, select: { gebruikerId: true }, take: 1 } } })).map((o) => [o.id, o]));
  const ai = aiPerKlant.map((a) => {
    const inT = a._sum.invoerTokens ?? 0;
    const uitT = a._sum.uitvoerTokens ?? 0;
    const o = namen.get(a.ondernemingId);
    return { ondernemingId: a.ondernemingId, naam: o?.naam ?? "(verwijderd)", gebruikerId: o?.leden[0]?.gebruikerId ?? null, verzoeken: a._sum.verzoeken ?? 0, invoerTokens: inT, uitvoerTokens: uitT, limietGeraakt: a._sum.limietGeraakt ?? 0, kostenDollar: aiKosten(inT, uitT) };
  });
  const limietHits30 = await db.aiVerbruik.aggregate({ where: { dag: { gte: sinds30 } }, _sum: { limietGeraakt: true } });

  const datums = aanmeldingen.map((a) => a.aangemaakt);
  return {
    perDag: telPerDag(datums, 14, nu),
    perWeek: telPerWeek(datums, 8, nu),
    totaalOndernemingen,
    status,
    betaaldOoit,
    proefNaarBetaaldPct: totaalOndernemingen ? Math.round((betaaldOoit / totaalOndernemingen) * 100) : null,
    gestopt30,
    gestoptTotaal,
    actief7,
    actief30,
    betalend: betalend.length,
    mrrCent,
    zonderBedrag,
    inProefBijStripe,
    proevenAflopend,
    ai,
    aiPrijsBekend: aiKosten(1, 1) != null,
    limietHits30: limietHits30._sum.limietGeraakt ?? 0,
  };
}

/** AI-gebruik van een of meer ondernemingen in de laatste 30 dagen. */
export async function aiVan(ondernemingIds: string[]) {
  return db.aiVerbruik.aggregate({ where: { ondernemingId: { in: ondernemingIds }, dag: { gte: new Date(Date.now() - 30 * DAG) } }, _sum: { verzoeken: true, invoerTokens: true, uitvoerTokens: true, limietGeraakt: true } });
}
