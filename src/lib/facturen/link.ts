import { createHmac, timingSafeEqual } from "crypto";
import { appGeheim } from "@/lib/crypto";
import { db } from "@/lib/db";

/**
 * Openbare link naar een factuur voor de klant (mail, WhatsApp). Ondertekend, zodat niemand nummers kan raden.
 * Openen telt als "geopend": de ondernemer krijgt één melding de eerste keer.
 */
const sig = (id: string) => createHmac("sha256", appGeheim()).update(`factuur:${id}`).digest("base64url").slice(0, 22);

export const factuurToken = (id: string) => `${id}.${sig(id)}`;

export function leesFactuurToken(token: string): string | null {
  const [id, s] = token.split(".");
  if (!id || !s) return null;
  const a = Buffer.from(s);
  const b = Buffer.from(sig(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const factuurUrl = (id: string) => `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/factuur/${factuurToken(id)}`;

export async function markeerGeopend(factuurId: string) {
  const f = await db.factuur.findUnique({ where: { id: factuurId }, include: { klant: { select: { naam: true } } } });
  if (!f || f.status === "concept") return;
  await db.factuur.update({ where: { id: f.id }, data: { geopendKeer: { increment: 1 }, geopendOp: f.geopendOp ?? new Date() } });
  if (!f.geopendOp) {
    await db.melding.create({ data: { ondernemingId: f.ondernemingId, soort: "systeem", titel: `${f.klant.naam} heeft factuur ${f.nummer} geopend`, tekst: "De klant heeft de factuur bekeken. Betaalt hij niet op tijd, dan herinnert Saldoplan hem vanzelf.", link: `/app/facturen/${f.id}` } });
  }
}
