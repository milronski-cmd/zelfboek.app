/**
 * Huisstijl van facturen, creditfacturen en offertes: één instelling voor alle drie.
 * Dit bestand heeft geen Node-afhankelijkheden, zodat de instellingenpagina (browser) het ook kan gebruiken.
 */

export const LAYOUTS = [
  { k: "klassiek", l: "Klassiek", uitleg: "Logo links, titel rechts en een gekleurde tabelkop." },
  { k: "modern", l: "Modern", uitleg: "Brede gekleurde band bovenaan met je logo erin." },
  { k: "minimaal", l: "Minimaal", uitleg: "Veel wit en dunne lijnen; kleur alleen voor het totaal." },
  { k: "accent", l: "Accent", uitleg: "Gekleurde streep langs de rand en een lichte tabelkop." },
] as const;
export type Layout = (typeof LAYOUTS)[number]["k"];

export const LETTERS = [
  { k: "helvetica", l: "Modern", uitleg: "Schreefloos, zoals Helvetica." },
  { k: "times", l: "Klassiek", uitleg: "Met schreef, zoals Times." },
] as const;
export type Letter = (typeof LETTERS)[number]["k"];

export const isLayout = (s: unknown): s is Layout => LAYOUTS.some((l) => l.k === s);
export const isLetter = (s: unknown): s is Letter => LETTERS.some((l) => l.k === s);

/** Geldige kleur als "#rrggbb" in kleine letters, anders null. */
export const hexOf = (s: unknown): string | null => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim().toLowerCase() : null);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mengt een kleur met wit: 0 is de kleur zelf, 1 is wit. Voor lichte vlakken in de huisstijlkleur. */
export function tint(hex: string, wit: number): string {
  const m = (c: number) => Math.round(c + (255 - c) * wit).toString(16).padStart(2, "0");
  return `#${rgb(hex).map(m).join("")}`;
}

/** Is de kleur zo licht dat witte tekst erop onleesbaar wordt? (relatieve luminantie, WCAG) */
export function isLicht(hex: string): boolean {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/** Alles wat de PDF nodig heeft om er uit te zien zoals de ondernemer wil. */
export type Huisstijl = {
  layout: Layout;
  kleur: string; // hoofdkleur, "#rrggbb"
  kleur2: string | null; // tweede kleur; leeg = hoofdkleur
  letter: Letter;
  /** Logo als PNG- of JPEG-bytes of een bestandspad; null = geen logo (dan staat de bedrijfsnaam). */
  logo: Uint8Array | string | null;
  voettekst: string | null;
};
