import { createHash, createHmac, timingSafeEqual } from "crypto";
import { appGeheim } from "./crypto";
import { bewaarKoppeling, leesKoppeling } from "./koppelingen";
import { MERK } from "./merk";
import { testmodus } from "./testmodus";

/**
 * Koppelen met één knop: de klant logt in bij de partij zelf (OAuth) en komt terug met "Gekoppeld".
 * Nooit een sleutel of token overtypen. Wij (het platform) hebben per partij één app-registratie nodig;
 * die staat in de omgeving (zie README, "Wat jij moet regelen voor livegang").
 *
 * Zonder app-registratie en buiten productie loopt de knop via de proefmodus (/app/koppelingen/proef):
 * zelfde stappen, met voorbeeldregels in plaats van echte gegevens.
 */

export type OAuthSoort = "mollie" | "stripe" | "shopify" | "woocommerce" | "moneybird" | "gmail" | "outlook" | "etsy" | "sumup" | "zettle" | "amazon" | "lightspeed";

type Aanbieder = {
  naam: string;
  /** Omgevingsvariabelen die wij als platform eenmalig moeten hebben. Leeg = geen platform-account nodig. */
  env: string[];
  /** Vraagt de knop eerst om het adres van de winkel? */
  vraagtAdres?: { label: string; voorbeeld: string };
  autoriseer: (p: { state: string; terug: string; adres?: string }) => string;
  /** Wisselt de terugkeer om in de configuratie die we (versleuteld) bewaren. */
  rondAf: (p: { query: URLSearchParams; terug: string; adres?: string }) => Promise<{ config: Record<string, string>; naam?: string }>;
};

/** PKCE-verifier afgeleid van de state met ons geheim: niet te raden, en hoeft nergens bewaard. */
const pkce = (state: string) => createHmac("sha256", appGeheim()).update(`pkce:${state}`).digest("base64url");

const basisUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const terugUrl = (soort: string) => `${basisUrl()}/api/koppelingen/${soort}/terug`;

async function postForm<T>(url: string, velden: Record<string, string>, kop: Record<string, string> = {}, dienst = "Koppeling"): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...kop }, body: new URLSearchParams(velden) });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`${dienst} gaf geen toegang (${r.status}). Probeer het opnieuw.${process.env.NODE_ENV === "production" ? "" : ` ${tekst.slice(0, 160)}`}`);
  return JSON.parse(tekst) as T;
}

const basic = (id: string, geheim: string) => `Basic ${Buffer.from(`${id}:${geheim}`).toString("base64")}`;

/** Winkeladres netjes maken: "mijnwinkel" wordt "mijnwinkel.myshopify.com", "https://winkel.nl/" wordt "https://winkel.nl". */
export function normaalAdres(soort: OAuthSoort, invoer: string): string | null {
  const s = invoer.trim().toLowerCase().replace(/\/+$/, "");
  if (!s) return null;
  if (soort === "shopify") {
    const kaal = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const shop = kaal.includes(".") ? kaal : `${kaal}.myshopify.com`;
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
  }
  const url = /^https?:\/\//.test(s) ? s : `https://${s}`;
  try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}`; } catch { return null; }
}

export const AANBIEDERS: Record<OAuthSoort, Aanbieder> = {
  mollie: {
    naam: "Mollie",
    env: ["MOLLIE_CLIENT_ID", "MOLLIE_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://my.mollie.com/oauth2/authorize?${new URLSearchParams({
      client_id: process.env.MOLLIE_CLIENT_ID!, redirect_uri: terug, state, response_type: "code", approval_prompt: "auto",
      scope: "payments.read payments.write settlements.read balances.read profiles.read organizations.read",
    })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token: string; expires_in: number }>("https://api.mollie.com/oauth2/tokens",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug },
        { Authorization: basic(process.env.MOLLIE_CLIENT_ID!, process.env.MOLLIE_CLIENT_SECRET!) }, "Mollie");
      // Betaallinks via OAuth hebben het website-profiel nodig: het eerste profiel van de klant.
      const p = await fetch("https://api.mollie.com/v2/profiles?limit=1", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => null) as { _embedded?: { profiles?: { id: string; name?: string }[] } } | null;
      const profiel = p?._embedded?.profiles?.[0];
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String(Date.now() + t.expires_in * 1000), profileId: profiel?.id ?? "" }, naam: profiel?.name };
    },
  },
  stripe: {
    naam: "Stripe",
    env: ["STRIPE_CONNECT_CLIENT_ID", "STRIPE_SECRET_KEY"],
    autoriseer: ({ state, terug }) => `https://connect.stripe.com/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: process.env.STRIPE_CONNECT_CLIENT_ID!, scope: "read_only", state, redirect_uri: terug })}`,
    rondAf: async ({ query }) => {
      const t = await postForm<{ stripe_user_id: string }>("https://connect.stripe.com/oauth/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "" }, { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, "Stripe");
      return { config: { stripeAccount: t.stripe_user_id } };
    },
  },
  shopify: {
    naam: "Shopify",
    env: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    vraagtAdres: { label: "Naam van je winkel", voorbeeld: "mijnwinkel.myshopify.com" },
    autoriseer: ({ state, terug, adres }) => `https://${adres}/admin/oauth/authorize?${new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID!, scope: "read_shopify_payments_payouts", redirect_uri: terug, state })}`,
    rondAf: async ({ query, adres }) => {
      // Shopify ondertekent de terugkeer: alle parameters behalve hmac, gesorteerd, met ons app-geheim.
      const hmac = query.get("hmac") ?? "";
      const bericht = [...query.entries()].filter(([k]) => k !== "hmac").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
      const verwacht = createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET!).update(bericht).digest("hex");
      if (!gelijk(hmac, verwacht)) throw new Error("Shopify: de terugkeer was niet echt. Probeer het opnieuw.");
      const shop = query.get("shop") ?? adres ?? "";
      if (shop !== adres) throw new Error("Shopify: een andere winkel dan je opgaf.");
      const r = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, code: query.get("code") }) });
      if (!r.ok) throw new Error(`Shopify gaf geen toegang (${r.status}). Probeer het opnieuw.`);
      const t = (await r.json()) as { access_token: string };
      return { config: { shop, accessToken: t.access_token }, naam: shop };
    },
  },
  woocommerce: {
    // WooCommerce heeft een eigen inlogscherm in elke webshop (wc-auth): geen platform-account nodig.
    naam: "WooCommerce",
    env: [],
    vraagtAdres: { label: "Adres van je webshop", voorbeeld: "www.mijnwinkel.nl" },
    autoriseer: ({ state, terug, adres }) => `${adres}/wc-auth/v1/authorize?${new URLSearchParams({
      app_name: MERK, scope: "read", user_id: state, return_url: `${terug}?state=${encodeURIComponent(state)}`, callback_url: `${basisUrl()}/api/koppelingen/woocommerce/sleutels`,
    })}`,
    // De sleutels komen los binnen op /api/koppelingen/woocommerce/sleutels; de terugkeer meldt alleen of de klant ja zei.
    rondAf: async ({ query }) => {
      if (query.get("success") === "0") throw new Error("Je hebt de koppeling in je webshop geweigerd.");
      return { config: {} };
    },
  },
  moneybird: {
    naam: "Moneybird",
    env: ["MONEYBIRD_CLIENT_ID", "MONEYBIRD_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://moneybird.com/oauth/authorize?${new URLSearchParams({ client_id: process.env.MONEYBIRD_CLIENT_ID!, redirect_uri: terug, response_type: "code", state, scope: "sales_invoices documents bank settings" })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token?: string }>("https://moneybird.com/oauth/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.MONEYBIRD_CLIENT_ID!, client_secret: process.env.MONEYBIRD_CLIENT_SECRET! }, {}, "Moneybird");
      return { config: { token: t.access_token, refreshToken: t.refresh_token ?? "" } };
    },
  },
  // ── Klaargezet: werkt zodra de app-registratie (env) er is. Zonder: proefmodus of "Binnenkort". ──
  gmail: {
    naam: "Gmail",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: terug, response_type: "code", state, access_type: "offline", prompt: "consent",
      scope: "https://www.googleapis.com/auth/gmail.readonly email",
    })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token?: string; expires_in: number }>("https://oauth2.googleapis.com/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! }, {}, "Google");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token ?? "", verloopt: String(Date.now() + t.expires_in * 1000) } };
    },
  },
  outlook: {
    naam: "Outlook",
    env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!, redirect_uri: terug, response_type: "code", state, response_mode: "query",
      scope: "offline_access Mail.Read User.Read",
    })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token?: string; expires_in: number }>("https://login.microsoftonline.com/common/oauth2/v2.0/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: "offline_access Mail.Read User.Read" }, {}, "Microsoft");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token ?? "", verloopt: String(Date.now() + t.expires_in * 1000) } };
    },
  },
  etsy: {
    // Etsy gebruikt PKCE; de verifier leiden we af van de state met ons geheim (staat nooit in de URL).
    naam: "Etsy",
    env: ["ETSY_CLIENT_ID"],
    autoriseer: ({ state, terug }) => `https://www.etsy.com/oauth/connect?${new URLSearchParams({
      response_type: "code", client_id: process.env.ETSY_CLIENT_ID!, redirect_uri: terug, scope: "transactions_r shops_r", state,
      code_challenge: createHash("sha256").update(pkce(state)).digest("base64url"), code_challenge_method: "S256",
    })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token: string; expires_in: number }>("https://api.etsy.com/v3/public/oauth/token",
        { grant_type: "authorization_code", client_id: process.env.ETSY_CLIENT_ID!, redirect_uri: terug, code: query.get("code") ?? "", code_verifier: pkce(query.get("state") ?? "") }, {}, "Etsy");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String(Date.now() + t.expires_in * 1000), gebruikerId: t.access_token.split(".")[0] } };
    },
  },
  sumup: {
    naam: "SumUp",
    env: ["SUMUP_CLIENT_ID", "SUMUP_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://api.sumup.com/authorize?${new URLSearchParams({ response_type: "code", client_id: process.env.SUMUP_CLIENT_ID!, redirect_uri: terug, scope: "transactions.history user.profile_readonly", state })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token: string; expires_in: number }>("https://api.sumup.com/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.SUMUP_CLIENT_ID!, client_secret: process.env.SUMUP_CLIENT_SECRET! }, {}, "SumUp");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String(Date.now() + t.expires_in * 1000) } };
    },
  },
  zettle: {
    naam: "Zettle",
    env: ["ZETTLE_CLIENT_ID", "ZETTLE_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://oauth.zettle.com/authorize?${new URLSearchParams({ response_type: "code", client_id: process.env.ZETTLE_CLIENT_ID!, redirect_uri: terug, scope: "READ:FINANCE READ:PURCHASE", state })}`,
    rondAf: async ({ query, terug }) => {
      const t = await postForm<{ access_token: string; refresh_token: string; expires_in: number }>("https://oauth.zettle.com/token",
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.ZETTLE_CLIENT_ID!, client_secret: process.env.ZETTLE_CLIENT_SECRET! }, {}, "Zettle");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String(Date.now() + t.expires_in * 1000) } };
    },
  },
  amazon: {
    // Amazon Selling Partner API: toestemming via Seller Central (EU), token via Login with Amazon.
    naam: "Amazon",
    env: ["AMAZON_SP_APP_ID", "AMAZON_LWA_CLIENT_ID", "AMAZON_LWA_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://sellercentral-europe.amazon.com/apps/authorize/consent?${new URLSearchParams({ application_id: process.env.AMAZON_SP_APP_ID!, state, redirect_uri: terug, version: "beta" })}`,
    rondAf: async ({ query }) => {
      const t = await postForm<{ access_token: string; refresh_token: string; expires_in: number }>("https://api.amazon.com/auth/o2/token",
        { grant_type: "authorization_code", code: query.get("spapi_oauth_code") ?? "", client_id: process.env.AMAZON_LWA_CLIENT_ID!, client_secret: process.env.AMAZON_LWA_CLIENT_SECRET! }, {}, "Amazon");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String(Date.now() + t.expires_in * 1000), verkoperId: query.get("selling_partner_id") ?? "" } };
    },
  },
  lightspeed: {
    // Lightspeed Retail (X-Series): winkelnaam invullen, dan inloggen.
    naam: "Lightspeed",
    env: ["LIGHTSPEED_CLIENT_ID", "LIGHTSPEED_CLIENT_SECRET"],
    autoriseer: ({ state, terug }) => `https://secure.vendhq.com/connect?${new URLSearchParams({ response_type: "code", client_id: process.env.LIGHTSPEED_CLIENT_ID!, redirect_uri: terug, state })}`,
    rondAf: async ({ query, terug }) => {
      const domein = (query.get("domain_prefix") ?? "").replace(/[^a-z0-9-]/gi, "");
      if (!domein) throw new Error("Lightspeed gaf geen winkel terug. Probeer het opnieuw.");
      const t = await postForm<{ access_token: string; refresh_token: string; expires: number }>(`https://${domein}.vendhq.com/api/1.0/token`,
        { grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: terug, client_id: process.env.LIGHTSPEED_CLIENT_ID!, client_secret: process.env.LIGHTSPEED_CLIENT_SECRET! }, {}, "Lightspeed");
      return { config: { accessToken: t.access_token, refreshToken: t.refresh_token, verloopt: String((t.expires ?? 0) * 1000), domein }, naam: domein };
    },
  },
};

export const isOAuthSoort = (s: string): s is OAuthSoort => s in AANBIEDERS;

/** Heeft het platform de app-registratie voor deze partij? */
export const ingesteld = (soort: OAuthSoort) => AANBIEDERS[soort].env.every((e) => Boolean(process.env[e]));

/** Proefmodus: knoppen werken zonder platform-account, met voorbeeldgegevens. Nooit in productie, tenzij expliciet aangezet. */
export const proefmodus = () => process.env.SALDOPLAN_PROEFMODUS === "1" || testmodus() || (process.env.NODE_ENV !== "production" && process.env.SALDOPLAN_PROEFMODUS !== "0");

// ─────────────── Ondertekende state (geen sessie nodig bij de terugkeer van de partij) ───────────────

export type State = { o: string; s: string; a?: string; b?: string; t: number };

function gelijk(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const handtekening = (data: string) => createHmac("sha256", appGeheim()).update(`koppelen:${data}`).digest("base64url");

export function maakState(s: Omit<State, "t">): string {
  const data = Buffer.from(JSON.stringify({ ...s, t: Date.now() })).toString("base64url");
  return `${data}.${handtekening(data)}`;
}

/** Leest en controleert de state; ongeldig of ouder dan een uur geeft null. */
export function leesState(state: string | null | undefined, maxUur = 1): State | null {
  if (!state) return null;
  const [data, sig] = state.split(".");
  if (!data || !sig || !gelijk(sig, handtekening(data))) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as State;
    return Date.now() - s.t < maxUur * 3600e3 ? s : null;
  } catch { return null; }
}

// ─────────────── Tokens die verlopen (Mollie: een uur) ───────────────

/** Mollie-toegang voor API-aanroepen: OAuth-token (zo nodig ververst) of een oude API-sleutel. */
export async function mollieToegang(ondernemingId: string): Promise<{ token: string; profileId?: string; oauth: boolean } | null> {
  const k = await leesKoppeling<{ apiKey?: string; accessToken?: string; refreshToken?: string; verloopt?: string; profileId?: string; proef?: string }>(ondernemingId, "mollie");
  if (!k || k.proef) return null;
  if (k.apiKey) return { token: k.apiKey, oauth: false };
  if (!k.accessToken) return null;
  if (k.refreshToken && Number(k.verloopt ?? 0) < Date.now() + 60_000 && ingesteld("mollie")) {
    const t = await postForm<{ access_token: string; refresh_token?: string; expires_in: number }>("https://api.mollie.com/oauth2/tokens",
      { grant_type: "refresh_token", refresh_token: k.refreshToken }, { Authorization: basic(process.env.MOLLIE_CLIENT_ID!, process.env.MOLLIE_CLIENT_SECRET!) }, "Mollie");
    const { _id, _status, ...rest } = k;
    void _id; void _status;
    const nieuw = { ...rest, accessToken: t.access_token, refreshToken: t.refresh_token ?? k.refreshToken, verloopt: String(Date.now() + t.expires_in * 1000) };
    await bewaarKoppeling(ondernemingId, "mollie", nieuw as Record<string, string>);
    return { token: nieuw.accessToken, profileId: k.profileId || undefined, oauth: true };
  }
  return { token: k.accessToken, profileId: k.profileId || undefined, oauth: true };
}

/** Ververs-adressen voor OAuth-tokens die na een uur verlopen. */
const VERVERS: Partial<Record<OAuthSoort, () => { url: string; velden: Record<string, string>; kop?: Record<string, string> }>> = {
  gmail: () => ({ url: "https://oauth2.googleapis.com/token", velden: { client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! } }),
  outlook: () => ({ url: "https://login.microsoftonline.com/common/oauth2/v2.0/token", velden: { client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: "offline_access Mail.Read User.Read" } }),
  etsy: () => ({ url: "https://api.etsy.com/v3/public/oauth/token", velden: { client_id: process.env.ETSY_CLIENT_ID! } }),
  sumup: () => ({ url: "https://api.sumup.com/token", velden: { client_id: process.env.SUMUP_CLIENT_ID!, client_secret: process.env.SUMUP_CLIENT_SECRET! } }),
  zettle: () => ({ url: "https://oauth.zettle.com/token", velden: { client_id: process.env.ZETTLE_CLIENT_ID!, client_secret: process.env.ZETTLE_CLIENT_SECRET! } }),
  amazon: () => ({ url: "https://api.amazon.com/auth/o2/token", velden: { client_id: process.env.AMAZON_LWA_CLIENT_ID!, client_secret: process.env.AMAZON_LWA_CLIENT_SECRET! } }),
};

/** Geldig toegangstoken voor een OAuth-koppeling (zo nodig ververst), plus de rest van de configuratie. */
export async function toegang<T extends Record<string, string> = Record<string, string>>(ondernemingId: string, soort: OAuthSoort): Promise<(T & { accessToken: string }) | null> {
  const k = await leesKoppeling<Record<string, string>>(ondernemingId, soort as never);
  if (!k || k.proef || !k.accessToken) return null;
  const { _id, _status, ...cfg } = k;
  void _id; void _status;
  const v = VERVERS[soort];
  if (v && cfg.refreshToken && Number(cfg.verloopt ?? 0) < Date.now() + 60_000 && ingesteld(soort)) {
    const r = v();
    const t = await postForm<{ access_token: string; refresh_token?: string; expires_in: number }>(r.url, { grant_type: "refresh_token", refresh_token: cfg.refreshToken, ...r.velden }, r.kop ?? {}, AANBIEDERS[soort].naam);
    const nieuw = { ...cfg, accessToken: t.access_token, refreshToken: t.refresh_token ?? cfg.refreshToken, verloopt: String(Date.now() + t.expires_in * 1000) };
    await bewaarKoppeling(ondernemingId, soort as never, nieuw);
    return nieuw as unknown as T & { accessToken: string };
  }
  return cfg as T & { accessToken: string };
}
