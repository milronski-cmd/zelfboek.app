import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bonUploaden } from "@/lib/bonnen/verwerk";
import { bonJson, fout, mobielContext, route } from "@/lib/mobiel";
import { foutTekst } from "@/lib/fout";

export const maxDuration = 60;

/** Bonnen van de onderneming, nieuwste eerst. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const bonnen = await db.bon.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 100 });
  return NextResponse.json({ bonnen: bonnen.map(bonJson) });
});

/** Eén bon uploaden (multipart, veld "bestand"): foto of PDF. De AI leest hem uit en koppelt hem aan de bankregel. */
export const POST = route(async (req: Request) => {
  const { onderneming: o, schrijfFout } = await mobielContext(req);
  if (schrijfFout) return fout(403, schrijfFout);
  const fd = await req.formData().catch(() => null);
  const bestand = fd?.get("bestand");
  if (!(bestand instanceof File) || bestand.size === 0) return fout(400, "Geen bestand meegestuurd (veld 'bestand').");
  const type = bestand.type || (bestand.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  let r: Awaited<ReturnType<typeof bonUploaden>>;
  try {
    r = await bonUploaden(o.id, { naam: bestand.name || "bon.jpg", type, data: Buffer.from(await bestand.arrayBuffer()) }, "app");
  } catch (e) {
    return fout(400, foutTekst(e));
  }
  const bon = await db.bon.findUniqueOrThrow({ where: { id: r.bonId } });
  return NextResponse.json({ bon: bonJson(bon), gekoppeld: r.gekoppeld, melding: r.melding }, { status: r.ok ? 200 : 422 });
});
