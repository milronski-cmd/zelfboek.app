import { headers } from "next/headers";
import { db } from "./db";

/**
 * Eenvoudige limieten in de database (werkt ook met meerdere servers): tegen raden van inlogcodes,
 * misbruik van de demo en onbeperkte AI-kosten. Telt en registreert in één keer.
 */
export async function binnenLimiet(sleutel: string, max: number, periodeMs: number): Promise<boolean> {
  const sinds = new Date(Date.now() - periodeMs);
  const n = await db.poging.count({ where: { sleutel, aangemaakt: { gt: sinds } } });
  if (n >= max) return false;
  await db.poging.create({ data: { sleutel } });
  return true;
}

/** Alleen tellen, niets registreren. */
export async function aantalSinds(sleutel: string, periodeMs: number): Promise<number> {
  return db.poging.count({ where: { sleutel, aangemaakt: { gt: new Date(Date.now() - periodeMs) } } });
}

/** IP-adres van de bezoeker (achter Vercel of een proxy: het eerste adres in x-forwarded-for). */
export async function klantIp(req?: Request): Promise<string> {
  const h = req?.headers ?? (await headers());
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "onbekend";
  return ip.slice(0, 64);
}

export const UUR = 3600_000;
export const DAG = 24 * UUR;

/** AI-tegoed per onderneming per dag; een demo krijgt veel minder. */
export async function aiTegoed(ondernemingId: string, demo: boolean, gewicht = 1): Promise<boolean> {
  const max = demo ? 25 : Number(process.env.AI_MAX_PER_DAG ?? 400);
  const sleutel = `ai:${ondernemingId}`;
  if ((await aantalSinds(sleutel, DAG)) + gewicht > max) {
    await telAi(ondernemingId, { limietGeraakt: 1 });
    return false;
  }
  await db.poging.createMany({ data: Array.from({ length: gewicht }, () => ({ sleutel })) });
  await telAi(ondernemingId, { verzoeken: gewicht });
  return true;
}

/** Begin van vandaag (UTC): één regel AiVerbruik per onderneming per dag. */
function vandaag(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** AI-verbruik optellen (verzoeken, tokens uit het antwoord, daglimiet geraakt). Faalt nooit hard. */
export async function telAi(ondernemingId: string | null | undefined, n: { verzoeken?: number; invoerTokens?: number; uitvoerTokens?: number; limietGeraakt?: number }) {
  if (!ondernemingId) return;
  const inc = { verzoeken: n.verzoeken ?? 0, invoerTokens: n.invoerTokens ?? 0, uitvoerTokens: n.uitvoerTokens ?? 0, limietGeraakt: n.limietGeraakt ?? 0 };
  // try om alles heen: het tellen mag de AI nooit tegenhouden (ook niet met een oude databaseclient).
  try {
    await db.aiVerbruik.upsert({
      where: { ondernemingId_dag: { ondernemingId, dag: vandaag() } },
      create: { ondernemingId, dag: vandaag(), ...inc },
      update: { verzoeken: { increment: inc.verzoeken }, invoerTokens: { increment: inc.invoerTokens }, uitvoerTokens: { increment: inc.uitvoerTokens }, limietGeraakt: { increment: inc.limietGeraakt } },
    });
  } catch (e) {
    console.error("[ai-verbruik]", e instanceof Error ? e.message : e);
  }
}

/** Tokens uit een AI-antwoord (usage) bijschrijven. Cache-tokens tellen als invoer. */
export async function telTokens(ondernemingId: string | null | undefined, usage: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | null | undefined) {
  if (!usage) return;
  const invoer = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  await telAi(ondernemingId, { invoerTokens: invoer, uitvoerTokens: usage.output_tokens ?? 0 });
}

export const AI_OP = "Je hebt vandaag veel met de bot gedaan. Morgen kan het weer; je boekhouding blijft gewoon werken.";

/** Opruimen (door de dagelijkse taak). */
export async function ruimPogingenOp(): Promise<void> {
  await db.poging.deleteMany({ where: { aangemaakt: { lt: new Date(Date.now() - 2 * DAG) } } });
  await db.verwerkt.deleteMany({ where: { aangemaakt: { lt: new Date(Date.now() - 400 * DAG) } } });
}
