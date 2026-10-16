/** Bedragen en datums zoals in de webapp: Nederlands, euro met komma. */

const nl = "nl-NL";

export const euro = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat(nl, { style: "currency", currency: "EUR" }).format(n);

export const euroHeel = (n: number) => `${n < 0 ? "−" : ""}€ ${Math.abs(Math.round(n)).toLocaleString(nl)}`;

export const getal = (n: number, decimalen = 1) => n.toLocaleString(nl, { maximumFractionDigits: decimalen });

const naarDatum = (d: string | Date) => (typeof d === "string" ? new Date(d) : d);

/** 13 oktober 2026 */
export const datumNl = (d: string | Date) => new Intl.DateTimeFormat(nl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(naarDatum(d));

/** 13 okt, of 13 okt 2025 als het een ander jaar is. */
export const datumKort = (d: string | Date, nu = new Date()) => {
  const x = naarDatum(d);
  const zelfdeJaar = x.getFullYear() === nu.getFullYear();
  return new Intl.DateTimeFormat(nl, { day: "numeric", month: "short", ...(zelfdeJaar ? {} : { year: "numeric" }), timeZone: "Europe/Amsterdam" }).format(x).replace(".", "");
};

/** "zojuist", "3 uur geleden", "gisteren", anders de korte datum. */
export const wanneerNl = (d: string | Date, nu = new Date()) => {
  const x = naarDatum(d);
  const min = Math.round((nu.getTime() - x.getTime()) / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const uur = Math.round(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dag = Math.round(uur / 24);
  if (dag === 1) return "gisteren";
  if (dag < 7) return `${dag} dagen geleden`;
  return datumKort(x, nu);
};

/** jjjj-mm-dd in Nederland, voor datumvelden. */
export const isoDatum = (d: Date = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export const dagenTussen = (a: string | Date, b: string | Date = new Date()) => Math.floor((naarDatum(b).getTime() - naarDatum(a).getTime()) / 864e5);

/** "12,50" of "1.250,00" naar een getal, zoals de webapp het ook leest. */
export const parseBedrag = (tekst: string): number => {
  const t = tekst.trim().replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
  if (!t) return 0;
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  return Number(n) || 0;
};
