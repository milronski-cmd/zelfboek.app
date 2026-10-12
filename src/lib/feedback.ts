import { db } from "./db";
import { klopType } from "./bonnen/verwerk";
import { binnenLimiet, UUR } from "./limiet";
import { toestelUit } from "./beheer";

export const FEEDBACK_MAX_TEKENS = 4000;
export const SCHERM_MAX_BYTES = 4 * 1024 * 1024;
const SCHERM_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Feedback van een klant opslaan (webapp of mobiele app), met pagina, toestel en tijd; optioneel een schermafbeelding.
 * Hooguit 20 per uur per gebruiker. Daarna (optioneel) een seintje naar FEEDBACK_WEBHOOK_URL, zonder persoonsgegevens.
 */
export async function slaFeedbackOp(invoer: {
  gebruiker: { id: string; email: string };
  ondernemingId: string | null;
  tekst: string;
  pagina?: string | null;
  userAgent?: string | null;
  toestel?: string | null;
  bron: "web" | "app";
  bestand?: File | null;
}): Promise<{ ok: true; id: string } | { ok: false; melding: string }> {
  const tekst = invoer.tekst.trim();
  if (tekst.length < 3) return { ok: false, melding: "Schrijf even wat je vindt (minstens een paar woorden)." };
  if (tekst.length > FEEDBACK_MAX_TEKENS) return { ok: false, melding: `Dat is wat lang; hooguit ${FEEDBACK_MAX_TEKENS} tekens.` };
  if (!(await binnenLimiet(`feedback:${invoer.gebruiker.id}`, 20, UUR))) return { ok: false, melding: "Je hebt net al veel feedback gestuurd. Dank je! Probeer het over een uur opnieuw." };
  let schermafbeelding: Buffer | null = null;
  let schermMime: string | null = null;
  const f = invoer.bestand;
  if (f && f.size > 0) {
    if (f.size > SCHERM_MAX_BYTES) return { ok: false, melding: "De schermafbeelding is te groot (hooguit 4 MB)." };
    const data = Buffer.from(await f.arrayBuffer());
    const type = SCHERM_TYPES.find((t) => klopType(data, t));
    if (!type) return { ok: false, melding: "Alleen een foto of schermafbeelding (PNG, JPG of WebP) kan mee." };
    schermafbeelding = data;
    schermMime = type;
  }
  const pagina = invoer.pagina ? invoer.pagina.replace(/[?#].*$/, "").slice(0, 200) : null;
  const fb = await db.feedback.create({
    data: {
      gebruikerId: invoer.gebruiker.id,
      ondernemingId: invoer.ondernemingId,
      email: invoer.gebruiker.email,
      tekst,
      pagina,
      toestel: (invoer.toestel || toestelUit(invoer.userAgent))?.slice(0, 80) ?? null,
      bron: invoer.bron,
      schermafbeelding: schermafbeelding ? new Uint8Array(schermafbeelding) : null,
      schermMime,
    },
  });
  await meldNieuweFeedback({ id: fb.id, tekst, pagina, bron: invoer.bron });
  return { ok: true, id: fb.id };
}

/**
 * Seintje bij nieuwe feedback naar een eigen webhook (bijvoorbeeld Mission OS), alleen als FEEDBACK_WEBHOOK_URL gezet is.
 * Stuurt geen e-mailadres of naam mee; wel het begin van de tekst en de pagina. Mag nooit de klant ophouden.
 */
export async function meldNieuweFeedback(f: { id: string; tekst: string; pagina: string | null; bron: string }) {
  const url = process.env.FEEDBACK_WEBHOOK_URL;
  if (!url || !/^https?:\/\//.test(url)) return;
  const sleutel = process.env.FEEDBACK_WEBHOOK_SLEUTEL;
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "";
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sleutel ? { authorization: `Bearer ${sleutel}` } : {}) },
    body: JSON.stringify({ soort: "saldoplan-feedback", tekst: f.tekst.slice(0, 300), pagina: f.pagina, bron: f.bron, link: `${basis}/admin/feedback?id=${f.id}` }),
    signal: AbortSignal.timeout(4000),
  }).catch((e) => console.error("[feedback-webhook]", e instanceof Error ? e.message : e));
}
