/**
 * Eén plek voor al het verkeer met de Saldoplan-server. De app praat met dezelfde Next.js-backend en dezelfde
 * database als de webapp: via /api/mobiel (JSON) en via de gewone API-routes (PDF's, bestanden, de assistent).
 * Het sessietoken gaat als bearer-token mee; de server accepteert dat overal waar de webapp een cookie gebruikt.
 */
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";

const SLEUTEL = "saldoplan-sessie";

/** Adres van de server. Lokaal ontwikkelen: zet EXPO_PUBLIC_API_URL in .env op het adres van je Mac, bijvoorbeeld http://192.168.1.10:3000. */
export const BASIS = (process.env.EXPO_PUBLIC_API_URL ?? "https://app.saldoplan.nl").replace(/\/$/, "");

let token: string | null = null;
const luisteraars = new Set<() => void>();

// Op het web (de app bekijken op de pc) is er geen keychain; dan bewaart de browser het token.
const web = Platform.OS === "web" && typeof localStorage !== "undefined";

export async function laadToken(): Promise<string | null> {
  try { token = web ? localStorage.getItem(SLEUTEL) : await SecureStore.getItemAsync(SLEUTEL); } catch { token = null; }
  return token;
}
export async function zetToken(t: string | null) {
  token = t;
  try {
    if (web) { if (t) localStorage.setItem(SLEUTEL, t); else localStorage.removeItem(SLEUTEL); }
    else if (t) await SecureStore.setItemAsync(SLEUTEL, t);
    else await SecureStore.deleteItemAsync(SLEUTEL);
  } catch { /* zonder opslag blijft het token in het geheugen */ }
}
export const heeftToken = () => Boolean(token);
/** Wordt aangeroepen als de server zegt dat de sessie weg is (401): de app gaat dan terug naar het inlogscherm. */
export function bijUitgelogd(fn: () => void) { luisteraars.add(fn); return () => { luisteraars.delete(fn); }; }

export const koppen = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  "X-Saldoplan-App": "1",
  Accept: "application/json",
  ...extra,
});

export class ApiFout extends Error {
  constructor(public status: number, melding: string) { super(melding); }
}

export type Resultaat = { ok: true; melding: string; id?: string; naar?: string } | { ok: false; fout: string };

type Init = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; form?: FormData; timeoutMs?: number };

/** JSON-aanroep. Gooit ApiFout met de melding van de server ("fout" in de body). */
export async function api<T>(pad: string, init: Init = {}): Promise<T> {
  const method = init.method ?? (init.body || init.form ? "POST" : "GET");
  try {
    const res = await fetch(`${BASIS}${pad}`, {
      method,
      headers: koppen(init.body ? { "Content-Type": "application/json" } : {}),
      body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    });
    if (res.status === 401) { await zetToken(null); luisteraars.forEach((f) => f()); }
    const tekst = await res.text();
    let data: unknown = null;
    try { data = tekst ? JSON.parse(tekst) : null; } catch { data = null; }
    if (!res.ok) {
      const fout = (data as { fout?: string } | null)?.fout ?? (res.status === 401 ? "Je bent uitgelogd. Log opnieuw in." : `Er ging iets mis (${res.status}).`);
      throw new ApiFout(res.status, fout);
    }
    if (method !== "GET") meldUitkomst((data as { ok?: boolean } | null)?.ok === false ? "fout" : "ok");
    return data as T;
  } catch (e) {
    if (method !== "GET") meldUitkomst("fout");
    throw e;
  }
}

/**
 * Een server action van de webapp uitvoeren (dezelfde code, dezelfde controles). Velden gaan als formulier:
 * tekst, getallen, ja/nee ("on") en lijsten (meerdere waarden onder dezelfde naam).
 */
export async function actie(naam: string, velden: Record<string, string | number | boolean | null | undefined | string[]> = {}): Promise<Resultaat> {
  return api<Resultaat & { fout?: string }>("/api/mobiel/actie", { body: { naam, velden } });
}

// Knoppen luisteren mee: liep de laatste schrijfactie (POST) goed af? Dan tonen ze even een vinkje, anders een kruisje.
const uitkomstLuisteraars = new Set<(u: "ok" | "fout") => void>();
function meldUitkomst(u: "ok" | "fout") { uitkomstLuisteraars.forEach((f) => f(u)); }
export function bijUitkomst(f: (u: "ok" | "fout") => void) { uitkomstLuisteraars.add(f); return () => { uitkomstLuisteraars.delete(f); }; }

/** Zoals actie(), maar gooit bij een fout, zodat je in één regel kunt schrijven: await doe("x", {...}). */
export async function doe(naam: string, velden: Parameters<typeof actie>[1] = {}): Promise<Extract<Resultaat, { ok: true }>> {
  const r = await actie(naam, velden);
  if (!r.ok) throw new ApiFout(400, r.fout);
  return r;
}

/** Bestand (PDF, bon, export) van de server naar de cache van de app halen; geeft een file://-adres terug. */
export async function downloadNaarCache(pad: string, naam: string): Promise<string> {
  const veilig = naam.replace(/[^\w.-]+/g, "_");
  const doel = new File(Paths.cache, `${Date.now()}-${veilig}`);
  const bestand = await File.downloadFileAsync(`${BASIS}${pad}`, doel, { headers: koppen() });
  return bestand.uri;
}

/**
 * Multipart-upload (bonnen, importbestanden, logo). uri komt uit de camera of de bestandskiezer.
 * De globale fetch is in Expo de WinterCG-variant: die kent geen { uri } zoals React Native, maar wel
 * objecten met bytes(), name en type. Het bestand wordt pas gelezen op het moment van verzenden.
 */
export function bestandVeld(uri: string, naam: string, type: string) {
  const bestand = new File(uri);
  return { name: naam, type, bytes: () => bestand.bytes() } as unknown as Blob;
}

/**
 * Streaming-antwoord van de assistent: regel voor regel JSON (NDJSON), zoals de webapp het ook leest.
 * Gebruikt expo/fetch, want de gewone fetch van React Native kan niet streamen.
 */
export async function* stream<T = Record<string, unknown>>(pad: string, body: unknown, signaal?: AbortSignal): AsyncGenerator<T> {
  const res = await expoFetch(`${BASIS}${pad}`, { method: "POST", headers: koppen({ "Content-Type": "application/json" }), body: JSON.stringify(body), signal: signaal });
  if (!res.ok || !res.body) throw new ApiFout(res.status, res.status === 401 ? "Je bent uitgelogd. Log opnieuw in." : "De assistent is nu even niet bereikbaar.");
  const lezer = res.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { value, done } = await lezer.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const regels = rest.split("\n");
    rest = regels.pop() ?? "";
    for (const r of regels) {
      if (!r.trim()) continue;
      try { yield JSON.parse(r) as T; } catch { /* halve regel, komt in de volgende lus */ }
    }
  }
  if (rest.trim()) { try { yield JSON.parse(rest) as T; } catch { /* niets */ } }
}
