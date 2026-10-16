import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { URENCRITERIUM } from "@/lib/fiscaal/constanten-2026";
import { mobielContext, route } from "@/lib/mobiel";

/** Urenregistratie van een jaar (?jaar=), met voortgang op het urencriterium en open uren per klant. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const nu = new Date();
  const jaar = Number(new URL(req.url).searchParams.get("jaar")) || nu.getFullYear();
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const [regels, klanten] = await Promise.all([
    db.urenregel.findMany({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, orderBy: { datum: "desc" }, include: { klant: { select: { naam: true } } } }),
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" }, select: { id: true, naam: true } }),
  ]);
  const totaal = regels.reduce((s, r) => s + r.uren, 0);
  const declarabel = regels.filter((r) => r.soort === "declarabel").reduce((s, r) => s + r.uren, 0);
  const weekGeleden = new Date(nu.getTime() - 7 * 864e5);
  const dezeWeek = regels.filter((r) => r.datum >= weekGeleden).reduce((s, r) => s + r.uren, 0);
  const maandenVoorbij = jaar === nu.getFullYear() ? nu.getMonth() + 1 : 12;
  const perKlant = new Map<string, { klantId: string; naam: string; uren: number; bedrag: number }>();
  for (const r of regels.filter((r) => !r.gefactureerd && r.soort === "declarabel" && r.klantId)) {
    const k = perKlant.get(r.klantId!) ?? { klantId: r.klantId!, naam: r.klant?.naam ?? "", uren: 0, bedrag: 0 };
    k.uren += r.uren;
    k.bedrag += r.uren * (r.uurtarief ?? 0);
    perKlant.set(r.klantId!, k);
  }
  return NextResponse.json({
    jaar,
    regels: regels.map((r) => ({ id: r.id, datum: r.datum.toISOString(), uren: r.uren, omschrijving: r.omschrijving, soort: r.soort, uurtarief: r.uurtarief, gefactureerd: r.gefactureerd, klantId: r.klantId, klant: r.klant?.naam ?? null })),
    klanten,
    totaal: rond(totaal), declarabel: rond(declarabel), dezeWeek: rond(dezeWeek),
    criterium: URENCRITERIUM, pct: Math.min(100, Math.round((totaal / URENCRITERIUM) * 100)), verwacht: Math.round((totaal / maandenVoorbij) * 12),
    openPerKlant: [...perKlant.values()].map((k) => ({ ...k, uren: rond(k.uren), bedrag: rond(k.bedrag) })),
  });
});
