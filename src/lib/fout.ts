/**
 * Foutmelding voor de gebruiker. Onze eigen meldingen (gewone Nederlandse zinnen) komen door;
 * technische fouten (database, netwerk, code) niet: die gaan naar het serverlog en de gebruiker krijgt een rustige zin.
 */
const TECHNISCH = /prisma|invocation|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|TypeError|ReferenceError|SyntaxError|Cannot read|is not a function|undefined|Unexpected token|JSON|SQL|\bP\d{4}\b|stack|at .+\(.+:\d+:\d+\)|NEXT_|digest/i;

export const ALGEMENE_FOUT = "Er ging iets mis. Probeer het over een minuut opnieuw; er is niets verloren gegaan.";

export function foutTekst(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!m || m.length > 300 || m.includes("\n") || TECHNISCH.test(m)) {
    console.error("[fout]", e);
    return ALGEMENE_FOUT;
  }
  return m;
}
