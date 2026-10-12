import { createHmac, timingSafeEqual } from "crypto";
import { appGeheim } from "@/lib/crypto";

/**
 * Het eigen bonnen-mailadres van een onderneming: bonnen+<id>.<code>@domein. De code is ondertekend,
 * zodat niemand met alleen het (openbare) id bonnen in andermans boekhouding kan mailen.
 */
const code = (id: string) => createHmac("sha256", appGeheim()).update(`bonadres:${id}`).digest("hex").slice(0, 10);

export const bonAdres = (ondernemingId: string) => `bonnen+${ondernemingId}.${code(ondernemingId)}@${process.env.INBOUND_DOMEIN ?? "saldoplan.nl"}`;

/** Koppelcode voor WhatsApp: "Koppel <id>.<code>" vanaf je telefoon zet je nummer vast aan je onderneming. */
export const whatsappKoppelTekst = (ondernemingId: string) => `Koppel ${ondernemingId}.${code(ondernemingId)}`;

export function ondernemingUitKoppelTekst(tekst: string): string | null {
  const m = tekst.trim().match(/^koppel\s+([a-z0-9]+)\.([a-f0-9]{10})$/i);
  if (!m) return null;
  const a = Buffer.from(m[2].toLowerCase());
  const b = Buffer.from(code(m[1]));
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}

/** Onderneming uit een ontvangstadres, alleen als de code klopt. */
export function ondernemingUitBonAdres(aan: string): string | null {
  const m = aan.match(/bonnen\+([a-z0-9]+)\.([a-f0-9]{10})@/i);
  if (!m) return null;
  const a = Buffer.from(m[2].toLowerCase());
  const b = Buffer.from(code(m[1]));
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}
