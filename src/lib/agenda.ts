/**
 * Agenda-bestand (.ics) inlezen: afspraken met begin, eind, titel en plaats. Werkt met export uit
 * Google Agenda, Outlook en Apple Agenda. Gebruikt voor de urenschatting en kilometers uit de agenda.
 */
export type Afspraak = { start: Date; eind: Date; titel: string; locatie: string; heleDag: boolean };

function datum(waarde: string): { d: Date; heleDag: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(waarde.trim());
  if (!m) return null;
  const [, j, mnd, dag, u, min, sec, z] = m;
  if (!u) return { d: new Date(Number(j), Number(mnd) - 1, Number(dag)), heleDag: true };
  const d = z ? new Date(Date.UTC(+j, +mnd - 1, +dag, +u, +min, +sec)) : new Date(+j, +mnd - 1, +dag, +u, +min, +sec);
  return { d, heleDag: false };
}

const ontsnap = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

export function leesAgenda(tekst: string): Afspraak[] {
  // Regels die met een spatie beginnen horen bij de vorige regel (vouwen volgens RFC 5545).
  const regels = tekst.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const uit: Afspraak[] = [];
  let e: Record<string, string> | null = null;
  for (const r of regels) {
    if (r === "BEGIN:VEVENT") { e = {}; continue; }
    if (r === "END:VEVENT" && e) {
      const s = e.DTSTART ? datum(e.DTSTART) : null;
      const t = e.DTEND ? datum(e.DTEND) : null;
      if (s && e.STATUS !== "CANCELLED") uit.push({ start: s.d, eind: t?.d ?? s.d, titel: ontsnap(e.SUMMARY ?? ""), locatie: ontsnap(e.LOCATION ?? ""), heleDag: s.heleDag });
      e = null;
      continue;
    }
    if (!e) continue;
    const i = r.indexOf(":");
    if (i < 0) continue;
    const sleutel = r.slice(0, i).split(";")[0].toUpperCase();
    if (!(sleutel in e)) e[sleutel] = r.slice(i + 1);
  }
  return uit;
}

/** Uren van afspraken (hele dagen tellen niet mee: dat zijn vaak vakanties of herinneringen). */
export const urenVan = (a: Afspraak) => (a.heleDag ? 0 : Math.max(0, Math.min(12, (a.eind.getTime() - a.start.getTime()) / 36e5)));
