import { db } from "@/lib/db";
import { leesKoppeling, koppelingStatus, type KoppelingSoort } from "@/lib/koppelingen";
import { btwUitInclusief } from "@/lib/btw";
import { maakHash } from "@/lib/bank/csv";

export type KanaalRegel = {
  datum: Date;
  bedrag: number;            // positief = uitbetaling/omzet, negatief = kosten
  tegenpartij: string;
  omschrijving: string;
  externId: string;
  categorie: "omzet" | "betaalprovider" | "klant_terugbetaling" | "overige_opbrengst";
  btwCode: "21" | "9" | "0" | "geen" | "eu_dienst" | "vrijgesteld";
};

export type KanaalUitkomst = { nieuw: number; fouten: string[] };

export async function kanaalConfig<T extends Record<string, string>>(ondernemingId: string, soort: KoppelingSoort, verplicht: (keyof T)[], hulp: string): Promise<T> {
  const k = await leesKoppeling<T>(ondernemingId, soort);
  if (!k) throw new Error(`${hulp} is niet gekoppeld. Voeg de sleutel toe bij Koppelingen.`);
  for (const v of verplicht) if (!k[v]) throw new Error(`${hulp}: veld "${String(v)}" ontbreekt in de koppeling.`);
  return k;
}

/**
 * Kanaalregels opslaan als Transactie (bron = kanaal). Omzet-uitbetalingen staan al vast op categorie,
 * dus de AI hoeft ze niet te beoordelen: zakelijk true, bevestigd true.
 */
export async function bewaarKanaalRegels(ondernemingId: string, bron: KoppelingSoort, regels: KanaalRegel[]): Promise<number> {
  let nieuw = 0;
  for (const r of regels) {
    const hash = maakHash(r.datum, r.bedrag, r.tegenpartij, r.omschrijving, `${bron}:${r.externId}`);
    const btwBedrag = r.btwCode === "21" || r.btwCode === "9" ? btwUitInclusief(Math.abs(r.bedrag), r.btwCode) : 0;
    const res = await db.transactie
      .createMany({
        data: [{
          ondernemingId, datum: r.datum, bedrag: r.bedrag, tegenpartij: r.tegenpartij, omschrijving: r.omschrijving, hash,
          bron, externId: r.externId, categorie: r.categorie, btwCode: r.btwCode, btwBedrag,
          zakelijk: true, zekerheid: 1, bevestigd: true, uitleg: `Automatisch uit ${bron}`,
        }],
      })
      .catch((e: unknown) => { if ((e as { code?: string })?.code === "P2002") return { count: 0 }; throw e; });
    nieuw += res.count;
  }
  return nieuw;
}

export async function voerKanaalUit(ondernemingId: string, soort: KoppelingSoort, werk: () => Promise<number>): Promise<KanaalUitkomst> {
  try {
    const nieuw = await werk();
    await koppelingStatus(ondernemingId, soort, "actief");
    return { nieuw, fouten: [] };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await koppelingStatus(ondernemingId, soort, "fout", m).catch(() => undefined);
    return { nieuw: 0, fouten: [m] };
  }
}

/**
 * Mag de server dit adres ophalen? Alleen https naar een openbaar adres: geen localhost, intern netwerk of
 * cloud-metadata (anders kan iemand via een "winkeladres" ons interne netwerk aftasten).
 */
export async function openbaarAdres(url: string): Promise<URL> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("Ongeldig adres."); }
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("Alleen een gewoon https-adres kan.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const { lookup } = await import("dns/promises");
  const adressen = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error(`Adres ${host} niet gevonden.`); });
  if (!adressen.length || adressen.some((a) => privéAdres(a.address))) throw new Error("Dit adres is niet bereikbaar vanaf internet.");
  return u;
}

function isIP(h: string) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":"); }

export function privéAdres(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const d = v4.split(".").map(Number);
  if (d.length === 4 && d.every((x) => x >= 0 && x <= 255)) {
    const [a, b] = d;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::" || l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("ff");
}

/** Bekende API's (vaste adressen in onze code); alle andere adressen komen van de gebruiker en worden gecontroleerd. */
const VERTROUWD = /(^|\.)(mollie\.com|stripe\.com|bol\.com|paypal\.com|moneybird\.com|e-boekhouden\.nl|etsy\.com|sumup\.com|izettle\.com|zettle\.com|amazon\.com|amazon\.eu|lightspeedapp\.com|lightspeedhq\.com|googleapis\.com|microsoft\.com|jortt\.nl|enablebanking\.com)$/;

const MAX_POGINGEN = 4;
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wachttijd uit Retry-After (seconden of HTTP-datum), begrensd zodat een sync nooit eindeloos hangt. */
function wachtTijd(r: Response, poging: number): number {
  const max = Number(process.env.KOPPELING_MAX_WACHT_MS ?? 30000);
  const ra = r.headers.get("retry-after");
  let ms = 1000 * 2 ** poging;
  if (ra !== null && ra !== "") {
    const sec = Number(ra);
    ms = Number.isFinite(sec) ? sec * 1000 : new Date(ra).getTime() - Date.now();
  }
  return Math.min(Math.max(0, Number.isFinite(ms) ? ms : 1000), max);
}

/** Leesbare foutmelding uit de gangbare foutvormen (detail, message, title, error_description, errors[]). */
export function foutTekst(t: string): string {
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const eerste = Array.isArray(j.errors) ? (j.errors[0] as { message?: string } | string | undefined) : undefined;
    const kandidaten = [j.detail, j.message, j.title, j.error_description, j.error, typeof j.errors === "string" ? j.errors : undefined, typeof eerste === "string" ? eerste : eerste?.message];
    const m = kandidaten.find((x) => typeof x === "string" && x.trim());
    if (m) return String(m);
  } catch { /* geen JSON */ }
  return t;
}

/**
 * fetch met JSON-antwoord. Bij 429 (rate limit) en 502/503/504 wordt tot 3 keer opnieuw geprobeerd,
 * met de Retry-After van de dienst als die er is. Geeft ook de headers terug (paginering via Link of X-WP-TotalPages).
 */
export async function haalJsonMetKoppen<T>(url: string, init?: RequestInit, dienst = "API"): Promise<{ data: T; headers: Headers }> {
  // Vaste API's van bekende diensten mogen redirecten; een adres dat een gebruiker invulde (eigen winkel) moet publiek zijn
  // en mag niet redirecten (SSRF-bescherming), en zijn foutteksten tonen we niet.
  const vertrouwd = VERTROUWD.test(new URL(url).hostname);
  if (!vertrouwd) await openbaarAdres(url);
  for (let poging = 0; ; poging++) {
    const r = await fetch(url, { ...init, redirect: vertrouwd ? "follow" : "error", signal: init?.signal ?? AbortSignal.timeout(30_000) });
    if ([429, 502, 503, 504].includes(r.status) && poging < MAX_POGINGEN - 1) {
      await r.text().catch(() => "");
      await wacht(wachtTijd(r, poging));
      continue;
    }
    if (!r.ok) {
      const t = vertrouwd ? await r.text().catch(() => "") : "";
      if (r.status === 401 || r.status === 403) throw new Error(`${dienst}: sleutel ongeldig of onvoldoende rechten (${r.status}). ${foutTekst(t).slice(0, 160)}`.trim());
      if (r.status === 404 && !vertrouwd) throw new Error(`${dienst}: niets gevonden op dit adres (404). Klopt het adres van je winkel?`);
      if (r.status === 429) throw new Error(`${dienst}: te veel verzoeken (429), probeer het later opnieuw.`);
      throw new Error(`${dienst} ${r.status}: ${foutTekst(t).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 200) || r.statusText}`);
    }
    const tekst = await r.text();
    return { data: (tekst ? JSON.parse(tekst) : null) as T, headers: r.headers };
  }
}

export async function haalJson<T>(url: string, init?: RequestInit, dienst = "API"): Promise<T> {
  return (await haalJsonMetKoppen<T>(url, init, dienst)).data;
}

/** Bedrag uit een decimale string ("12.34") of getal; ongeldig wordt 0. */
export const bedragUit = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};

/** Afronden op centen, zodat optellen van decimale bedragen geen 0,1 + 0,2-fouten geeft. */
export const centen = (n: number) => Math.round(n * 100) / 100;

export const isoDag = (d: Date) => d.toISOString().slice(0, 10);
