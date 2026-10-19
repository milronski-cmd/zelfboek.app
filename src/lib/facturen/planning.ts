// Rekenen met het ritme van vaste facturen. Zonder database, dus ook bruikbaar in het formulier (client).

export const INTERVALLEN = ["week", "maand", "kwartaal", "jaar"] as const;

/** Voorbeelden voor een lege pagina: één klik en het formulier staat ingevuld. */
export const VOORBEELDEN: Record<string, { naam: string; regel: string; prijs: number; interval: string }> = {
  hosting: { naam: "Hosting en onderhoud", regel: "Hosting en onderhoud website", prijs: 45, interval: "maand" },
  retainer: { naam: "Vaste uren", regel: "Strippenkaart: 12 uur per maand", prijs: 960, interval: "maand" },
  licentie: { naam: "Jaarlicentie", regel: "Licentie en updates, één jaar", prijs: 240, interval: "jaar" },
};

export const intervalTekst: Record<string, string> = { week: "Elke week", maand: "Elke maand", kwartaal: "Elk kwartaal", jaar: "Elk jaar" };

/** "per maand", "per kwartaal": achter een bedrag. */
export const perTekst: Record<string, string> = { week: "per week", maand: "per maand", kwartaal: "per kwartaal", jaar: "per jaar" };

/** Hoeveel keer per maand er een factuur komt; een week telt als 52 / 12. */
export const perMaandFactor: Record<string, number> = { week: 52 / 12, maand: 1, kwartaal: 1 / 3, jaar: 1 / 12 };

export function volgendeDatum(d: Date, interval: string): Date {
  const n = new Date(d);
  if (interval === "week") {
    n.setDate(n.getDate() + 7);
    return n;
  }
  const maanden = interval === "kwartaal" ? 3 : interval === "jaar" ? 12 : 1;
  const dag = n.getDate();
  n.setDate(1);
  n.setMonth(n.getMonth() + maanden);
  const laatste = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  n.setDate(Math.min(dag, laatste)); // 31 januari + 1 maand = 28/29 februari
  return n;
}

/** De eerste datum in het ritme die niet in het verleden ligt (vandaag telt mee). Voor hervatten na een pauze. */
export function eersteVanaf(d: Date, interval: string, nu: Date = new Date()): Date {
  const vandaag = new Date(nu);
  vandaag.setHours(0, 0, 0, 0);
  let x = new Date(d);
  while (x < vandaag) x = volgendeDatum(x, interval);
  return x;
}

/** De eerstvolgende factuurdata vanaf `start`, hooguit `aantal`, niet voorbij `tot` (stopdatum) of `grens`. */
export function komendeData(start: Date, interval: string, aantal: number, tot?: Date | null, grens?: Date): Date[] {
  const uit: Date[] = [];
  let d = new Date(start);
  while (uit.length < aantal && (!tot || d <= tot) && (!grens || d <= grens)) {
    uit.push(d);
    d = volgendeDatum(d, interval);
  }
  return uit;
}

const z = { timeZone: "Europe/Amsterdam" } as const;

/** Het ritme in gewone woorden: "elke maand op de 1e", "elke week op maandag", "elk jaar op 1 november". */
export function ritmeTekst(start: Date, interval: string): string {
  const dag = Number(start.toLocaleDateString("nl-NL", { day: "numeric", ...z }));
  if (interval === "week") return `elke week op ${start.toLocaleDateString("nl-NL", { weekday: "long", ...z })}`;
  if (interval === "jaar") return `elk jaar op ${start.toLocaleDateString("nl-NL", { day: "numeric", month: "long", ...z })}`;
  return `${interval === "kwartaal" ? "elk kwartaal" : "elke maand"} op de ${dag}e`;
}

/** "vandaag", "morgen", "over 5 dagen", "over 3 weken": hoe ver een datum weg is. */
export function overTekst(d: Date, nu: Date = new Date()): string {
  const dag = (x: Date) => new Date(x.toLocaleDateString("sv-SE", z)).getTime();
  const dagen = Math.round((dag(d) - dag(nu)) / 864e5);
  if (dagen < 0) return dagen === -1 ? "gisteren" : `${-dagen} dagen geleden`;
  if (dagen === 0) return "vandaag";
  if (dagen === 1) return "morgen";
  if (dagen < 14) return `over ${dagen} dagen`;
  if (dagen < 60) return `over ${Math.round(dagen / 7)} weken`;
  return `over ${Math.round(dagen / 30)} maanden`;
}
