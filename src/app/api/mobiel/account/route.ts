import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abonnementStatus, wisselOnderneming } from "@/lib/auth";
import { isBeheerder } from "@/lib/beheer";
import { fout, mobielContext, route } from "@/lib/mobiel";

/** Wie ben ik: gebruiker, actieve onderneming, alle ondernemingen, rol en abonnementsstatus. */
export const GET = route(async (req: Request) => {
  const { sessie, onderneming: o, rol, magSchrijven, schrijfFout } = await mobielContext(req);
  const leden = await db.lidmaatschap.findMany({ where: { gebruikerId: sessie.gebruikerId }, include: { onderneming: { select: { id: true, naam: true } } } });
  const status = abonnementStatus(o);
  return NextResponse.json({
    gebruiker: { email: sessie.gebruiker.email, naam: sessie.gebruiker.naam, totpAan: sessie.gebruiker.totpAan, beheerder: isBeheerder(sessie.gebruiker.email) },
    onderneming: { id: o.id, naam: o.naam, demo: Boolean(o.demoTot), korDeelnemer: o.korDeelnemer, btwTijdvak: o.btwTijdvak },
    ondernemingen: leden.map((l) => ({ id: l.onderneming.id, naam: l.onderneming.naam, rol: l.rol })),
    rol, magSchrijven, schrijfFout,
    abonnement: { status: o.abonnement, toegang: status.toegang, tekst: status.tekst, proefTot: o.proefTot?.toISOString() ?? null },
  });
});

/** Van onderneming wisselen. Body: { ondernemingId }. */
export const POST = route(async (req: Request) => {
  await mobielContext(req);
  const body = (await req.json().catch(() => ({}))) as { ondernemingId?: string };
  if (!body.ondernemingId) return fout(400, "ondernemingId ontbreekt.");
  await wisselOnderneming(body.ondernemingId);
  return NextResponse.json({ ok: true });
});
