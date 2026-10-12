import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { geheimKlopt } from "@/lib/crypto";
import { bonUploaden, BON_TYPES } from "@/lib/bonnen/verwerk";

/**
 * Bonnen via WhatsApp (WhatsApp Business Platform, Cloud API). De ondernemer stuurt een foto of PDF naar ons nummer;
 * we herkennen hem aan het telefoonnummer bij zijn bedrijfsgegevens en sturen kort terug wat we lazen.
 * Nodig (env): WHATSAPP_TOKEN, WHATSAPP_TELEFOON_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_NUMMER (voor in de app).
 */
const GRAPH = "https://graph.facebook.com/v21.0";

/** Meta controleert de webhook één keer bij het instellen. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && geheimKlopt(q.get("hub.verify_token"), process.env.WHATSAPP_VERIFY_TOKEN)) return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Niet toegestaan", { status: 403 });
}

const alleenCijfers = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^0(?=6)/, "31");

async function antwoord(aan: string, tekst: string) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_TELEFOON_ID) return;
  await fetch(`${GRAPH}/${process.env.WHATSAPP_TELEFOON_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: aan, type: "text", text: { body: tekst } }),
  }).catch(() => undefined);
}

export async function POST(req: Request) {
  const ruw = await req.text();
  // Alleen berichten die echt van Meta komen (handtekening met ons app-geheim).
  const verwacht = process.env.WHATSAPP_APP_SECRET ? `sha256=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(ruw).digest("hex")}` : null;
  if (!verwacht || !geheimKlopt(req.headers.get("x-hub-signature-256"), verwacht)) return NextResponse.json({ fout: "Niet toegestaan" }, { status: 401 });

  type Bericht = { from: string; type: string; image?: { id: string; mime_type: string }; document?: { id: string; mime_type: string; filename?: string } };
  const body = JSON.parse(ruw) as { entry?: { changes?: { value?: { messages?: Bericht[] } }[] }[] };
  const berichten = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const b of berichten) {
    const media = b.image ?? b.document;
    if (!media) { await antwoord(b.from, "Stuur een foto of PDF van je bon, dan boekt Saldoplan hem."); continue; }
    // Onderneming op telefoonnummer (bedrijfsgegevens). Onbekend nummer: vriendelijk weigeren.
    const kandidaten = await db.onderneming.findMany({ where: { telefoon: { not: null }, demoTot: null }, select: { id: true, telefoon: true } });
    const o = kandidaten.find((x) => alleenCijfers(x.telefoon) === alleenCijfers(b.from));
    if (!o) { await antwoord(b.from, "Dit nummer kennen we niet. Zet je mobiele nummer bij Instellingen > Bedrijf in Saldoplan en probeer het opnieuw."); continue; }
    if (!BON_TYPES.includes(media.mime_type)) { await antwoord(b.from, "Dit bestand kan Saldoplan niet lezen. Stuur een foto (JPG/PNG) of een PDF."); continue; }
    try {
      const info = await fetch(`${GRAPH}/${media.id}`, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }).then((r) => r.json() as Promise<{ url: string }>);
      const data = Buffer.from(await (await fetch(info.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } })).arrayBuffer());
      const r = await bonUploaden(o.id, { naam: b.document?.filename ?? `whatsapp-${media.id}.${media.mime_type.split("/")[1]}`, type: media.mime_type, data }, "whatsapp");
      await antwoord(b.from, r.ok ? `Ontvangen: ${r.melding}` : `Deze bon kon Saldoplan niet lezen: ${r.melding}`);
    } catch {
      await antwoord(b.from, "Er ging iets mis bij het ophalen van je bon. Probeer het nog eens.");
    }
  }
  return NextResponse.json({ ontvangen: berichten.length });
}
