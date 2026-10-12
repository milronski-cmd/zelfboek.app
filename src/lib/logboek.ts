import { db } from "./db";

/** Eén regel in het logboek: wie veranderde wat. Faalt nooit hard (het logboek mag niets tegenhouden). */
export async function logboek(ondernemingId: string, wie: string | null, actie: string, onderwerp?: string | null) {
  await db.logboek.create({ data: { ondernemingId, wie: wie ?? "Saldoplan", actie: actie.slice(0, 200), onderwerp: onderwerp?.slice(0, 200) ?? null } }).catch(() => undefined);
}

/** Logboekregel namens de ingelogde gebruiker. */
export async function logNu(ondernemingId: string, actie: string, onderwerp?: string | null) {
  const { huidigeSessie } = await import("./auth");
  const s = await huidigeSessie().catch(() => null);
  await logboek(ondernemingId, s?.gebruiker.email ?? null, actie, onderwerp);
}
