/**
 * Welkomstvenster voor nieuwe accounts en de belafspraak daaruit: tijdsloten en Nederlandse tijd.
 * Geen Node-afhankelijkheden, zodat de browser dezelfde dagen en sloten kan tonen als de server controleert.
 */

const TZ = "Europe/Amsterdam";

/** Beltijden: werkdagen van 9 tot en met 16:30, elk half uur. */
export const SLOTEN = Array.from({ length: 16 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
/** Hoeveel werkdagen de kiezer laat zien. */
export const DAGEN_VOORUIT = 8;
/** Tot hoe ver vooruit een afspraak mag. */
export const MAX_DAGEN = 60;
/** Minimaal zoveel minuten van tevoren. */
export const MINIMAAL_VOORUIT = 60;

/** Tijd in Nederland als "uu:mm". */
export const nlTijd = (d: Date) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** Dag in Nederland als "jjjj-mm-dd". */
export const nlDag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const isWerkdag = (d: Date) => !["Sat", "Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d));

/** "woensdag 14 oktober om 10:30" */
export const nlDatumTijd = (d: Date) => `${new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d)} om ${nlTijd(d)}`;

/** "wo 14 okt" */
export const nlDagKort = (d: Date) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d).replace(/\.$/, "");

/** Dag ("jjjj-mm-dd") en tijd ("uu:mm") in Nederland naar een Date; klopt in zomer- en wintertijd. */
export function nlDatum(dag: string, tijd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag) || !/^\d{2}:\d{2}$/.test(tijd)) return null;
  for (const offset of ["+02:00", "+01:00"]) {
    const d = new Date(`${dag}T${tijd}:00${offset}`);
    if (Number.isNaN(d.getTime())) return null;
    if (nlTijd(d) === tijd && nlDag(d) === dag) return d;
  }
  return null;
}

/** Account jonger dan een week: dan krijgt de gebruiker het welkomstvenster nog. */
export const versAccount = (aangemaakt: Date) => Date.now() - aangemaakt.getTime() < 7 * 864e5;
export const isVoorbij = (d: Date) => d.getTime() < Date.now();

export type BelDag = { dag: string; label: string; sloten: string[] };

/** De eerstvolgende werkdagen met hun nog beschikbare sloten; vandaag telt mee zolang er sloten over zijn. */
export function belDagen(nu = new Date(), aantal = DAGEN_VOORUIT): BelDag[] {
  const uit: BelDag[] = [];
  const grens = nu.getTime() + MINIMAAL_VOORUIT * 60_000;
  const vandaag = nlDag(nu);
  for (let i = 0; i < 30 && uit.length < aantal; i++) {
    const d = new Date(nu.getTime() + i * 864e5);
    if (!isWerkdag(d)) continue;
    const dag = nlDag(d);
    const sloten = SLOTEN.filter((t) => (nlDatum(dag, t)?.getTime() ?? 0) >= grens);
    if (!sloten.length) continue;
    const label = dag === vandaag ? "Vandaag" : i === 1 ? "Morgen" : nlDagKort(d);
    uit.push({ dag, label, sloten });
  }
  return uit;
}
