import { NextResponse } from "next/server";
import { fout, mobielContext, route } from "@/lib/mobiel";
import { slaFeedbackOp } from "@/lib/feedback";

/** Feedback uit de mobiele app (multipart: tekst, scherm, toestel, optioneel bestand). Ook leden met alleen leesrechten mogen feedback geven. */
export const POST = route(async (req: Request) => {
  const { sessie, onderneming } = await mobielContext(req);
  const fd = await req.formData().catch(() => null);
  if (!fd) return fout(400, "Er kwam niets mee.");
  const bestand = fd.get("bestand");
  const r = await slaFeedbackOp({
    gebruiker: sessie.gebruiker,
    ondernemingId: onderneming.id,
    tekst: String(fd.get("tekst") ?? ""),
    pagina: String(fd.get("scherm") ?? "") || null,
    toestel: String(fd.get("toestel") ?? "") || null,
    userAgent: req.headers.get("user-agent"),
    bron: "app",
    bestand: bestand instanceof File ? bestand : null,
  });
  return r.ok ? NextResponse.json({ ok: true }) : fout(400, r.melding);
});
