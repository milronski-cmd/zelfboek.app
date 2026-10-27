import { lookup as dnsLookup } from "node:dns";
import { Agent } from "undici";
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

function privéV4(a: number, b: number): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** IPv6 (ook met ingebed IPv4-staartje, bijv. ::ffff:1.2.3.4) naar 16 bytes; null als het geen geldig IPv6-adres is. */
function ipv6Bytes(ip: string): number[] | null {
  let h = ip.toLowerCase().split("%")[0];
  const staart = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (staart) {
    const q = staart.slice(2).map(Number);
    if (q.some((x) => x > 255)) return null;
    h = `${staart[1]}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/.test(h) || (h.match(/::/g) ?? []).length > 1) return null;
  const [kop, rest] = h.split("::");
  const delen = (t: string | undefined) => (t ? t.split(":") : []);
  const k = delen(kop), r = rest === undefined ? [] : delen(rest);
  if (rest === undefined ? k.length !== 8 : k.length + r.length > 7) return null;
  const groepen = rest === undefined ? k : [...k, ...Array(8 - k.length - r.length).fill("0"), ...r];
  const bytes: number[] = [];
  for (const g of groepen) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 255);
  }
  return bytes;
}

/** Is dit een adres waar de server niet naartoe mag (intern, loopback, link-local, metadata, multicast, of een IPv6-vorm daarvan)? Onleesbaar = geweigerd. */
export function privéAdres(ip: string): boolean {
  const d = ip.split(".").map(Number);
  if (d.length === 4 && /^[\d.]+$/.test(ip)) return d.some((x) => !(x >= 0 && x <= 255)) || privéV4(d[0], d[1]);
  const x = ipv6Bytes(ip);
  if (!x) return true;
  const nul = (van: number, tot: number) => x.slice(van, tot).every((v) => v === 0);
  // ::/96 (onbepaald, loopback, IPv4-compatible): nooit
  if (nul(0, 12)) return true;
  // ::ffff:a.b.c.d (IPv4-mapped), ook in de hexvorm ::ffff:7f00:1
  if (nul(0, 10) && x[10] === 255 && x[11] === 255) return privéV4(x[12], x[13]);
  // NAT64: 64:ff9b::/96 met ingebed IPv4, en 64:ff9b:1::/48 (lokaal gebruik)
  if (x[0] === 0 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b) return x[4] !== 0 || x[5] !== 0 || !nul(6, 12) || privéV4(x[12], x[13]);
  // 6to4: 2002::/16 met ingebed IPv4
  if (x[0] === 0x20 && x[1] === 0x02) return privéV4(x[2], x[3]);
  // Teredo 2001::/32, documentatie 2001:db8::/32, discard 100::/64
  if (x[0] === 0x20 && x[1] === 0x01 && ((x[2] === 0 && x[3] === 0) || (x[2] === 0x0d && x[3] === 0xb8))) return true;
  if (x[0] === 0x01 && x[1] === 0 && nul(2, 8)) return true;
  // fc00::/7 (unique local), fe80::/10 (link-local), fec0::/10 (site-local), ff00::/8 (multicast)
  return (x[0] & 0xfe) === 0xfc || (x[0] === 0xfe && (x[1] & 0xc0) >= 0x80) || x[0] === 0xff;
}

type Adres = { address: string; family: number };
type LookupTerug = (err: NodeJS.ErrnoException | null, adres?: string | Adres[], family?: number) => void;
type Resolver = (hostname: string, opties: { all: true }, cb: (err: NodeJS.ErrnoException | null, adressen: Adres[]) => void) => void;

/**
 * Verbindingstijd-controle tegen DNS-rebinding: openbaarAdres() lost de naam op vóór het ophalen, maar fetch lost hem
 * daarna nog eens op; een domein met korte TTL kan de tweede keer 127.0.0.1 geven. Deze lookup draait op het moment dat
 * de verbinding wordt gemaakt en weigert elk adres dat privéAdres() afwijst, zodat er alleen verbonden wordt met een
 * adres dat dezelfde controle heeft doorstaan.
 */
export function maakVeiligeLookup(resolver: Resolver = dnsLookup as unknown as Resolver) {
  return (hostname: string, opties: { all?: boolean }, cb: LookupTerug) => {
    resolver(hostname, { all: true }, (err, adressen) => {
      if (err) return cb(err);
      if (!adressen?.length || adressen.some((a) => privéAdres(a.address))) return cb(new Error("Dit adres is niet bereikbaar vanaf internet."));
      if (opties.all) return cb(null, adressen);
      cb(null, adressen[0].address, adressen[0].family);
    });
  };
}

let veiligeAgent: Agent | undefined;
/** undici-verbinding die alleen naar openbare adressen verbindt (voor adressen die een gebruiker invulde). */
const onvertrouwdeAgent = () => (veiligeAgent ??= new Agent({ connect: { lookup: maakVeiligeLookup() as never } }));

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
    const r = await fetch(url, { ...init, redirect: vertrouwd ? "follow" : "error", signal: init?.signal ?? AbortSignal.timeout(30_000), ...(vertrouwd ? {} : { dispatcher: onvertrouwdeAgent() }) } as RequestInit);
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
