import { NextResponse } from "next/server";
import { huidigeSessie } from "@/lib/auth";
import { slaFeedbackOp } from "@/lib/feedback";

/** Feedback uit de webapp (multipart: tekst, pagina, optioneel bestand). Alleen ingelogd. */
export async function POST(req: Request) {
  const s = await huidigeSessie();
  if (!s) return NextResponse.json({ fout: "Log eerst in." }, { status: 401 });
  if (s.meekijkerEmail) return NextResponse.json({ fout: "Je kijkt mee; feedback sturen kan niet namens de klant." }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ fout: "Er kwam niets mee." }, { status: 400 });
  const bestand = fd.get("bestand");
  const r = await slaFeedbackOp({
    gebruiker: s.gebruiker,
    ondernemingId: s.actieveOndernemingId,
    tekst: String(fd.get("tekst") ?? ""),
    pagina: String(fd.get("pagina") ?? "") || null,
    userAgent: req.headers.get("user-agent"),
    bron: "web",
    bestand: bestand instanceof File ? bestand : null,
  });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ fout: r.melding }, { status: 400 });
}
