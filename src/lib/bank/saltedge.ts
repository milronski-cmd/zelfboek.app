import { createSign } from "crypto";
import { db } from "@/lib/db";
import { bewaarKoppeling, koppelingStatus, leesKoppeling } from "@/lib/koppelingen";
import { maakRegel, type BankRegel } from "./csv";
import { importeerRegels } from "./importeer";

/**
 * PSD2-bankkoppeling via Salt Edge (Account Information API v6, docs.saltedge.com/v6).
 * Salt Edge werkt onder zijn eigen AISP-vergunning (Partner Program): de klant kiest zijn bank in de Salt Edge-pagina,
 * logt in met de bank-app en komt terug. Geen eigen account of betaling van de klant bij Salt Edge.
 *
 * Env: SALTEDGE_APP_ID en SALTEDGE_SECRET (verplicht), SALTEDGE_PRIVATE_KEY (PEM; verplicht zodra de app op Live staat,
 * dan wordt elke aanroep ondertekend), SALTEDGE_PARTNER="1" (klant op e-mail, Partner Program; leeg = Client-account,
 * zoals in de eerste sandbox), SALTEDGE_SANDBOX="1" (nepbanken van Salt Edge in plaats van de echte bank),
 * SALTEDGE_API_URL (alleen voor tests).
 *
 * Config in koppeling "saltedge": { customerId?, verbindingen: [{ id, bank, tot }] }. Eén klant bij Salt Edge per onderneming,
 * per bank één verbinding; "Toestemming verlengen" maakt geen nieuwe verbinding maar vernieuwt de bestaande (reconnect).
 */
const API = () => (process.env.SALTEDGE_API_URL || "https://www.saltedge.com/api/v6").replace(/\/$/, "");
/** Hoe lang de klant toestemming geeft; daarna één keer opnieuw inloggen bij de bank. */
export const TOESTEMMING_DAGEN = 90;

type Verbinding = { id: string; bank: string; tot?: string };
type SeConfig = { customerId?: string; verbindingen?: Verbinding[]; proef?: string };

/** Banken in Saldoplan → providercode bij Salt Edge (lijst op saltedge.com, te controleren met GET /providers?country_code=NL). */
export const PROVIDERS: Record<string, string> = {
  ing: "ing_oauth_client_nl", rabobank: "rabobank_oauth_client_nl", abnamro: "abn_amro_oauth_client_nl", bunq: "bunq_oauth_client_nl",
  knab: "knab_client_nl", sns: "snsbank_oauth_client_nl", asn: "asnbank_oauth_client_nl", regiobank: "regiobank_oauth_client_nl",
  triodos: "triodos_oauth_client_nl",
};
const sleutel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/bank$/, "");
export function providerVoor(bankNaam: string): string | undefined {
  const k = sleutel(bankNaam);
  return PROVIDERS[k] ?? PROVIDERS[`${k}bank`] ?? Object.entries(PROVIDERS).find(([id]) => sleutel(id) === k)?.[1];
}

function sleutels() {
  const appId = process.env.SALTEDGE_APP_ID;
  const secret = process.env.SALTEDGE_SECRET;
  if (!appId || !secret) throw new Error("Salt Edge is niet ingesteld: zet SALTEDGE_APP_ID en SALTEDGE_SECRET.");
  return { appId, secret, privateKey: process.env.SALTEDGE_PRIVATE_KEY?.replace(/\\n/g, "\n") };
}

/** Handtekening van Salt Edge: base64(RSA-SHA256("Expires-at|METHOD|url|body")). */
export function onderteken(privateKey: string, verlooptOp: number, methode: string, url: string, body: string) {
  const s = createSign("RSA-SHA256");
  s.update(`${verlooptOp}|${methode.toUpperCase()}|${url}|${body}`);
  return s.sign(privateKey, "base64");
}

export class SaltEdgeFout extends Error {
  constructor(public status: number, public klasse: string, bericht: string) { super(bericht); }
}

async function api<T>(pad: string, init?: { method?: string; body?: unknown }): Promise<{ data: T; meta?: { next_id?: string | null } }> {
  const { appId, secret, privateKey } = sleutels();
  const methode = init?.method ?? "GET";
  const url = `${API()}${pad}`;
  const body = init?.body === undefined ? "" : JSON.stringify(init.body);
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json", "App-id": appId, Secret: secret };
  if (privateKey) {
    const verloopt = Math.floor(Date.now() / 1000) + 60;
    headers["Expires-at"] = String(verloopt);
    headers.Signature = onderteken(privateKey, verloopt, methode, url, body);
  }
  const r = await fetch(url, { method: methode, headers, body: body || undefined, signal: AbortSignal.timeout(30_000) });
  const tekst = await r.text();
  let json: { data?: T; meta?: { next_id?: string | null }; error?: { class?: string; message?: string }; error_class?: string; error_message?: string } = {};
  try { json = tekst ? JSON.parse(tekst) : {}; } catch { /* geen JSON */ }
  if (!r.ok) {
    const klasse = json.error?.class ?? json.error_class ?? "Onbekend";
    throw new SaltEdgeFout(r.status, klasse, `Salt Edge ${r.status} ${klasse}: ${(json.error?.message ?? json.error_message ?? tekst).slice(0, 200)}`);
  }
  return { data: json.data as T, meta: json.meta };
}

/** Alle pagina's van een lijst (from_id/next_id), met een plafond tegen eindeloos doorlopen. */
async function alles<T>(pad: string, maxPaginas = 50): Promise<T[]> {
  const uit: T[] = [];
  let vanaf: string | null | undefined;
  for (let i = 0; i < maxPaginas; i++) {
    const r = await api<T[]>(`${pad}${pad.includes("?") ? "&" : "?"}${vanaf ? `from_id=${encodeURIComponent(vanaf)}&` : ""}per_page=1000`);
    uit.push(...(r.data ?? []));
    vanaf = r.meta?.next_id;
    if (!vanaf) break;
  }
  return uit;
}

const partner = () => process.env.SALTEDGE_PARTNER === "1";
const sandbox = () => process.env.SALTEDGE_SANDBOX === "1";
/** Vaste klantcode per onderneming (Client-account): geen opslag nodig en nooit een tweede klant. */
const identifier = (ondernemingId: string) => `saldoplan-${ondernemingId}`;

async function config(ondernemingId: string): Promise<SeConfig> {
  const k = await leesKoppeling<SeConfig>(ondernemingId, "saltedge");
  return { customerId: k?.customerId, verbindingen: k?.verbindingen ?? [], proef: k?.proef };
}

async function bewaar(ondernemingId: string, cfg: SeConfig, naam?: string) {
  await bewaarKoppeling(ondernemingId, "saltedge", { customerId: cfg.customerId, verbindingen: cfg.verbindingen ?? [] }, naam);
}

/**
 * De klant bij Salt Edge, één per onderneming: Partner op het (bij het inloggen geverifieerde) e-mailadres,
 * Client op een vaste code. Bestaat hij al, dan zoeken we hem op in plaats van een tweede te maken.
 */
async function klantId(ondernemingId: string, email: string, cfg: SeConfig): Promise<string> {
  if (cfg.customerId) return cfg.customerId;
  const data = partner() ? { email } : { identifier: identifier(ondernemingId) };
  try {
    const r = await api<{ customer_id: string }>("/customers", { method: "POST", body: { data } });
    return r.data.customer_id;
  } catch (e) {
    if (!(e instanceof SaltEdgeFout && e.klasse === "DuplicatedCustomer")) throw e;
    const klanten = await alles<{ customer_id: string; email?: string; identifier?: string }>("/customers");
    const k = klanten.find((c) => (partner() ? c.email?.toLowerCase() === email.toLowerCase() : c.identifier === identifier(ondernemingId)));
    if (!k) throw e;
    return k.customer_id;
  }
}

/**
 * Stap 1: adres van de Salt Edge-pagina waar de klant zijn bank kiest en inlogt.
 * Is deze bank al gekoppeld, dan vernieuwen we de toestemming van die verbinding (reconnect) in plaats van een nieuwe.
 */
export async function startAutorisatie(ondernemingId: string, bankNaam: string, returnTo: string, email: string): Promise<string> {
  const cfg = await config(ondernemingId);
  const consent = { scopes: ["accounts", "transactions"], period_days: TOESTEMMING_DAGEN, from_date: new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10) };
  const attempt = { fetch_scopes: ["accounts", "balance", "transactions"], return_to: returnTo, locale: "nl" };
  const algemeen = { return_connection_id: true, return_error_class: true, automatic_refresh: true };

  const bestaand = cfg.verbindingen?.find((v) => sleutel(v.bank) === sleutel(bankNaam));
  if (bestaand) {
    try {
      const r = await api<{ connect_url: string }>(`/connections/${encodeURIComponent(bestaand.id)}/reconnect`, { method: "POST", body: { data: { consent, attempt, ...algemeen } } });
      return r.data.connect_url;
    } catch (e) {
      if (!(e instanceof SaltEdgeFout && e.status === 404)) throw e; // verbinding bestaat niet meer: gewoon opnieuw koppelen
    }
  }

  const code = sandbox() ? process.env.SALTEDGE_PROEFBANK || "fake_oauth_client_xf" : providerVoor(bankNaam);
  const data: Record<string, unknown> = {
    consent, attempt, ...algemeen,
    categorization: "none", // boeken doet Saldoplan zelf
    widget: { allowed_countries: sandbox() ? ["XF"] : ["NL"], popular_providers_country: sandbox() ? "XF" : "NL" },
    ...(code ? { provider: { code, ...(sandbox() ? { include_sandboxes: true } : {}) } } : {}),
  };
  const id = await klantId(ondernemingId, email, cfg);
  if (id !== cfg.customerId) await bewaar(ondernemingId, { ...cfg, customerId: id }, "Bank (Salt Edge)");
  if (partner()) data.customer_id = id;
  else data.customer_identifier = identifier(ondernemingId);
  const r = await api<{ connect_url: string }>("/connections/connect", { method: "POST", body: { data } });
  return r.data.connect_url;
}

type SeVerbinding = { id: string; customer_id: string; provider_name?: string; provider_code?: string; status?: string };
type SeAccount = { id: string; name?: string; nature?: string; balance?: number; currency_code?: string; extra?: { iban?: string; account_name?: string; holder_name?: string } };
type SeConsent = { id: string; status?: string; expires_at?: string | null; created_at?: string };
type SeTx = {
  id: string; account_id: string; status?: string; made_on: string; amount: number; currency_code?: string; description?: string; duplicated?: boolean;
  extra?: { id?: string; payee?: string; payer?: string; payee_information?: string; payer_information?: string; additional?: string; information?: string; end_to_end_id?: string; posting_date?: string };
};

/** Hoort deze verbinding bij deze onderneming? (connection_id komt uit de adresbalk en is dus niet te vertrouwen.) */
async function eigenVerbinding(ondernemingId: string, cfg: SeConfig, connectionId: string): Promise<SeVerbinding> {
  const { data: v } = await api<SeVerbinding>(`/connections/${encodeURIComponent(connectionId)}`);
  if (!cfg.customerId || v.customer_id !== cfg.customerId) throw new Error("Deze bankkoppeling hoort niet bij jouw onderneming.");
  return v;
}

async function toestemmingTot(connectionId: string): Promise<Date> {
  try {
    const { data } = await api<SeConsent[]>(`/consents?connection_id=${encodeURIComponent(connectionId)}`);
    const actief = (data ?? []).filter((c) => c.expires_at && (!c.status || c.status === "active")).sort((a, b) => String(b.expires_at).localeCompare(String(a.expires_at)))[0];
    if (actief?.expires_at) return new Date(actief.expires_at);
  } catch { /* geen toestemmingsgegevens: schatten */ }
  return new Date(Date.now() + TOESTEMMING_DAGEN * 864e5);
}

/** Rekeningen van één verbinding in Bankrekening zetten (op IBAN, per onderneming). */
async function werkRekeningenBij(ondernemingId: string, v: Verbinding) {
  const accounts = await alles<SeAccount>(`/accounts?connection_id=${encodeURIComponent(v.id)}`);
  const tot = v.tot ? new Date(v.tot) : null;
  const uit: { rekId: string; accountId: string; iban: string }[] = [];
  for (const a of accounts) {
    const iban = (a.extra?.iban ?? "").replace(/\s/g, "").toUpperCase();
    if (!iban) continue;
    const naam = a.extra?.account_name || a.name || `${v.bank} ${iban.slice(-4)}`;
    const velden = { bron: "psd2", bank: v.bank, psd2SessieId: v.id, psd2AccountId: a.id, psd2Verloopt: tot, ...(typeof a.balance === "number" ? { saldo: a.balance } : {}) };
    const rek = await db.bankrekening.upsert({
      where: { ondernemingId_iban: { ondernemingId, iban } },
      update: velden,
      create: { ondernemingId, iban, naam, ...velden },
    });
    uit.push({ rekId: rek.id, accountId: a.id, iban });
  }
  return uit;
}

/** Stap 2: terug van Salt Edge met ?connection_id= → verbinding controleren en bewaren, rekeningen inlezen. */
export async function rondAutorisatieAf(ondernemingId: string, connectionId: string, bankNaam?: string): Promise<number> {
  const cfg = await config(ondernemingId);
  const v = await eigenVerbinding(ondernemingId, cfg, connectionId);
  const bank = bankNaam || v.provider_name || "Bank";
  const tot = (await toestemmingTot(connectionId)).toISOString();
  const verbindingen = [...(cfg.verbindingen ?? []).filter((x) => x.id !== connectionId && sleutel(x.bank) !== sleutel(bank)), { id: connectionId, bank, tot }];
  await bewaar(ondernemingId, { customerId: cfg.customerId, verbindingen }, verbindingen.map((x) => x.bank).join(", "));
  return (await werkRekeningenBij(ondernemingId, { id: connectionId, bank, tot })).length;
}

/** Eén Salt Edge-transactie als bankregel. Bedrag heeft al een teken (min = af). */
export function naarRegel(t: SeTx, eigenIban: string): BankRegel | null {
  if (t.status && t.status !== "posted") return null; // pending: id's zijn niet vast, komt later als geboekt terug
  if (t.duplicated) return null;
  const bij = t.amount > 0;
  const tegenNaam = (bij ? t.extra?.payer_information : t.extra?.payee_information) ?? "";
  const tegenRek = ((bij ? t.extra?.payer : t.extra?.payee) ?? "").replace(/\s/g, "").toUpperCase();
  const iban = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(tegenRek) ? tegenRek : undefined;
  const oms = [t.description, t.extra?.additional].filter((x) => x && x.trim()).join(" ").trim();
  const tegen = tegenNaam.trim() || (iban ? "" : tegenRek) || (t.description ?? "").slice(0, 60);
  return maakRegel(new Date(`${t.made_on}T12:00:00`), t.amount, tegen, oms, iban, eigenIban, `se:${t.extra?.id || t.id}`);
}

/** Transacties van alle Salt Edge-verbindingen ophalen en inlezen (dezelfde route als upload en Enable Banking). */
export async function syncSaltEdge(ondernemingId: string, vanaf?: Date): Promise<{ nieuw: number; fouten: string[] }> {
  const fouten: string[] = [];
  let nieuw = 0;
  try { sleutels(); } catch (e) { return { nieuw: 0, fouten: [e instanceof Error ? e.message : String(e)] }; }
  const cfg = await config(ondernemingId);
  if (!cfg.verbindingen?.length) return { nieuw: 0, fouten: [] }; // klant is nog bij Salt Edge bezig of heeft afgebroken
  let verlopen = 0;
  for (const v of cfg.verbindingen) {
    if (v.tot && new Date(v.tot) < new Date()) { verlopen++; fouten.push(`${v.bank}: toestemming bij de bank is verlopen; klik op Toestemming verlengen.`); continue; }
    try {
      for (const rek of await werkRekeningenBij(ondernemingId, v)) {
        const bestaand = await db.bankrekening.findUnique({ where: { id: rek.rekId }, select: { laatsteSync: true } });
        const start = vanaf ?? (bestaand?.laatsteSync ? new Date(bestaand.laatsteSync.getTime() - 7 * 864e5) : new Date(Date.now() - 90 * 864e5));
        const startDag = start.toISOString().slice(0, 10);
        const txs = await alles<SeTx>(`/transactions?connection_id=${encodeURIComponent(v.id)}&account_id=${encodeURIComponent(rek.accountId)}`);
        const regels = txs.filter((t) => t.made_on >= startDag).map((t) => naarRegel(t, rek.iban)).filter((r): r is BankRegel => Boolean(r));
        const uit = await importeerRegels(ondernemingId, regels, { bron: "psd2", bank: v.bank, bankrekeningId: rek.rekId, eigenIban: rek.iban });
        nieuw += uit.nieuw;
        if (uit.aiFout) fouten.push(uit.aiFout);
      }
    } catch (e) {
      fouten.push(`${v.bank}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (verlopen && verlopen === cfg.verbindingen.length) await koppelingStatus(ondernemingId, "saltedge", "verlopen", fouten[0]);
  else await koppelingStatus(ondernemingId, "saltedge", fouten.length ? "fout" : "actief", fouten[0]);
  return { nieuw, fouten };
}

/** Ontkoppelen: verbindingen bij Salt Edge verwijderen (trekt de toestemming in). Fouten daar houden het ontkoppelen niet tegen. */
export async function verwijderVerbindingen(ondernemingId: string) {
  const cfg = await config(ondernemingId);
  if (cfg.proef) return;
  for (const v of cfg.verbindingen ?? []) {
    try { await api(`/connections/${encodeURIComponent(v.id)}`, { method: "DELETE" }); } catch (e) { console.error("saltedge verwijderen", e instanceof Error ? e.message : e); }
  }
}
