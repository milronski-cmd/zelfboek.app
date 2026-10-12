import { db } from "@/lib/db";
import { esc, htmlMail, verstuurMail } from "@/lib/mail";
import { WETTELIJKE_HANDELSRENTE } from "@/lib/fiscaal/constanten-2026";
import { euro, rond } from "@/lib/btw";
import { datumIn, euroIn, taalVan, vul, WOORDEN } from "./taal";
import { factuurPdf } from "./pdf";

/** Wettelijke incassokosten (WIK-staffel, art. 2 Besluit vergoeding voor buitengerechtelijke incassokosten). Minimum 40 euro. */
export function incassokosten(hoofdsom: number): number {
  let k = 0;
  let rest = hoofdsom;
  const staffel: [number, number][] = [
    [2500, 0.15],
    [2500, 0.1],
    [5000, 0.05],
    [190000, 0.01],
    [Infinity, 0.005],
  ];
  for (const [grens, pct] of staffel) {
    const deel = Math.min(rest, grens);
    k += deel * pct;
    rest -= deel;
    if (rest <= 0) break;
  }
  return rond(Math.min(6775, Math.max(40, k)));
}

/** Wettelijke handelsrente over het aantal dagen te laat. Percentage uit constanten-2026 (één bron). */
export function wettelijkeRente(hoofdsom: number, dagenTeLaat: number, pctPerJaar = WETTELIJKE_HANDELSRENTE * 100): number {
  return rond((hoofdsom * (pctPerJaar / 100) * Math.max(0, dagenTeLaat)) / 365);
}

type Trap = 1 | 2 | 3;

function trapVoor(dagen: number, al: number): Trap | null {
  if (dagen >= 35 && al < 3) return 3;
  if (dagen >= 21 && al < 2) return 2;
  if (dagen >= 7 && al < 1) return 1;
  return null;
}

export async function stuurHerinnering(factuurId: string, ondernemingId: string, forceerTrap?: Trap): Promise<Trap> {
  const f = await db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId }, include: { klant: true, onderneming: true } });
  if (!f.klant.email) throw new Error("Klant heeft geen e-mailadres.");
  const dagen = Math.floor((Date.now() - f.vervaldatum.getTime()) / 864e5);
  const trap: Trap = forceerTrap ?? (Math.min(3, f.herinneringen + 1) as Trap);
  const open = rond(f.totaal - f.betaaldBedrag);
  const o = f.onderneming;
  const pdf = await factuurPdf(f);

  // In de taal van de klant. Voor Nederlandse klanten mag de ondernemer de tekst zelf schrijven (Instellingen > Facturen).
  const taal = taalVan(f.klant.taal);
  const w = WOORDEN[taal];
  const kosten = incassokosten(open);
  const rente = wettelijkeRente(open, dagen);
  const v = { nummer: f.nummer, bedrag: euroIn(taal, open), datum: datumIn(taal, f.vervaldatum), iban: o.iban ?? "[IBAN]", naam: o.naam, dagen, kosten: euroIn(taal, kosten), rente: euroIn(taal, rente), totaal: euroIn(taal, rond(open + kosten + rente)), klant: esc(f.klant.contactpersoon ?? f.klant.naam) };
  const eigen = taal === "nl" ? [o.herinneringTekst1, o.herinneringTekst2, o.herinneringTekst3][trap - 1]?.trim() : null;
  const onderwerp = vul(trap === 1 ? w.h1Onderwerp : trap === 2 ? w.h2Onderwerp : w.h3Onderwerp, v);
  const kern = eigen
    ? eigen.split(/\n\s*\n/).map((alinea) => esc(vul(alinea, v)).replace(/\n/g, "<br>"))
    : trap === 1 ? [vul(w.h1, v), w.h1Al] : trap === 2 ? [vul(w.h2, v), w.h2Gevolg] : [vul(w.h3, v), vul(w.h3Kosten, v), vul(w.h3Betalen, v)];
  const regels = [vul(w.aanhef, v), ...kern, `${w.groet}<br>${esc(o.naam)}`];
  await verstuurMail({
    aan: f.klant.email,
    onderwerp,
    antwoordAan: o.email ?? undefined,
    tekst: regels.map((r) => r.replace(/<br>/g, "\n")).join("\n\n") + (f.betaalLinkUrl ? `\n\nDirect betalen: ${f.betaalLinkUrl}` : ""),
    html: htmlMail(onderwerp, regels, f.betaalLinkUrl ? { tekst: w.directBetalen, url: f.betaalLinkUrl } : undefined),
    bijlagen: [{ filename: `${f.nummer}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  await db.factuur.update({
    where: { id: f.id },
    data: { herinneringen: Math.max(f.herinneringen + 1, trap), laatsteHerinnering: new Date(), status: trap === 3 ? "aangemaand" : "herinnerd" },
  });
  await db.melding.create({
    data: { ondernemingId, soort: "herinnering", titel: `${trap === 3 ? "Aanmaning" : "Herinnering"} verstuurd`, tekst: `${f.nummer} aan ${f.klant.naam} (${euro(open)} open)`, link: `/app/facturen/${f.id}` },
  });
  return trap;
}

/** Automatisch herinneren (cron). Contract: verstuurHerinneringen(ondernemingId) → { verstuurd }. */
export async function verstuurHerinneringen(ondernemingId: string): Promise<{ verstuurd: number }> {
  const o = await db.onderneming.findUnique({ where: { id: ondernemingId } });
  if (!o || !o.herinneringAuto) return { verstuurd: 0 };
  const nu = Date.now();
  const open = await db.factuur.findMany({
    where: { ondernemingId, soort: "factuur", status: { in: ["verzonden", "herinnerd", "aangemaand"] }, vervaldatum: { lt: new Date(nu - 7 * 864e5) } },
    include: { klant: true },
  });
  let verstuurd = 0;
  for (const f of open) {
    if (!f.klant.email) continue;
    if (f.laatsteHerinnering && nu - f.laatsteHerinnering.getTime() < 7 * 864e5) continue;
    const dagen = Math.floor((nu - f.vervaldatum.getTime()) / 864e5);
    const trap = trapVoor(dagen, f.herinneringen);
    if (!trap) continue;
    // Eerst claimen: draait de cron twee keer tegelijk, dan mailt maar één van de twee.
    const claim = await db.factuur.updateMany({ where: { id: f.id, laatsteHerinnering: f.laatsteHerinnering }, data: { laatsteHerinnering: new Date() } });
    if (claim.count === 0) continue;
    try {
      await stuurHerinnering(f.id, ondernemingId, trap);
      verstuurd++;
    } catch (e) {
      await db.melding.create({
        data: { ondernemingId, soort: "systeem", titel: "Herinnering mislukt", tekst: `${f.nummer}: ${e instanceof Error ? e.message : String(e)}`, link: `/app/facturen/${f.id}` },
      });
    }
  }
  return { verstuurd };
}
