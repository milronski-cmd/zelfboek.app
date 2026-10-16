import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isDubbeleVraag, openVragen } from "@/lib/vragen";
import { fout, mobielContext, route } from "@/lib/mobiel";

/** Meldingen en taken, zoals de pagina Meldingen in de webapp. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const [meldingen, alleTaken, vragen] = await Promise.all([
    db.melding.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 100 }),
    db.taak.findMany({ where: { ondernemingId: o.id }, orderBy: [{ klaar: "asc" }, { deadline: "asc" }, { aangemaakt: "desc" }], take: 100 }),
    openVragen(o.id),
  ]);
  const taken = alleTaken.filter((t) => t.klaar || !isDubbeleVraag(t.titel, vragen));
  return NextResponse.json({
    meldingen: meldingen.map((m) => ({ id: m.id, soort: m.soort, titel: m.titel, tekst: m.tekst, link: m.link, gelezen: m.gelezen, aangemaakt: m.aangemaakt.toISOString() })),
    taken: taken.map((t) => ({ id: t.id, titel: t.titel, deadline: t.deadline?.toISOString() ?? null, klaar: t.klaar, bron: t.bron, aangemaakt: t.aangemaakt.toISOString() })),
    ongelezen: meldingen.filter((m) => !m.gelezen).length,
    openVragen: vragen.length,
  });
});

/** Body: { gelezen: id | "alles" } | { taakToggle: id } | { taakNieuw: { titel, deadline? } } */
export const POST = route(async (req: Request) => {
  const { onderneming: o, schrijfFout } = await mobielContext(req);
  const body = (await req.json().catch(() => ({}))) as { gelezen?: string; taakToggle?: string; taakNieuw?: { titel?: string; deadline?: string } };
  if (body.gelezen) {
    await db.melding.updateMany({ where: { ondernemingId: o.id, ...(body.gelezen !== "alles" ? { id: body.gelezen } : {}) }, data: { gelezen: true } });
  } else if (body.taakToggle) {
    if (schrijfFout) return fout(403, schrijfFout);
    const t = await db.taak.findFirst({ where: { id: body.taakToggle, ondernemingId: o.id } });
    if (t) await db.taak.update({ where: { id: t.id }, data: { klaar: !t.klaar } });
  } else if (body.taakNieuw) {
    if (schrijfFout) return fout(403, schrijfFout);
    const titel = String(body.taakNieuw.titel ?? "").trim();
    const dl = String(body.taakNieuw.deadline ?? "");
    if (!titel) return fout(400, "Geef de taak een titel.");
    await db.taak.create({ data: { ondernemingId: o.id, titel, deadline: dl ? new Date(dl) : null, bron: "gebruiker" } });
  } else {
    return fout(400, "Niets te doen.");
  }
  revalidatePath("/app");
  return NextResponse.json({ ok: true });
});
