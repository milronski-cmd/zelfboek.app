import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { btwUitInclusief } from "@/lib/btw";
import { fout, mobielContext, route, transactieJson } from "@/lib/mobiel";

/** Eén bankregel bevestigen als zakelijk of privé. Body: { keuze: "zakelijk" | "prive" }. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o, schrijfFout } = await mobielContext(req);
  if (schrijfFout) return fout(403, schrijfFout);
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { keuze?: string };
  if (body.keuze !== "zakelijk" && body.keuze !== "prive") return fout(400, "Keuze moet zakelijk of prive zijn.");
  const t = await db.transactie.findFirst({ where: { id, ondernemingId: o.id } });
  if (!t) return fout(404, "Bankregel niet gevonden.");
  const zakelijk = body.keuze === "zakelijk";
  const regel = await db.transactie.update({
    where: { id: t.id },
    data: {
      zakelijk,
      categorie: zakelijk ? t.categorie ?? "overig" : "prive",
      btwCode: zakelijk ? t.btwCode ?? "21" : "geen",
      btwBedrag: zakelijk ? btwUitInclusief(Math.abs(t.bedrag), t.btwCode ?? "21") : 0,
      bevestigd: true,
      zekerheid: 1,
      uitleg: zakelijk ? "Door jou bevestigd als zakelijk" : "Door jou gemarkeerd als privé",
    },
  });
  return NextResponse.json({ ok: true, regel: transactieJson(regel) });
});
