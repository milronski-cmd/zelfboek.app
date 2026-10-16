import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { KM_VERGOEDING } from "@/lib/fiscaal/constanten-2026";
import { mobielContext, route } from "@/lib/mobiel";

/** Kilometerregistratie van een jaar (?jaar=). */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const jaar = Number(new URL(req.url).searchParams.get("jaar")) || new Date().getFullYear();
  const regels = await db.kilometerregel.findMany({ where: { ondernemingId: o.id, datum: { gte: new Date(jaar, 0, 1), lt: new Date(jaar + 1, 0, 1) } }, orderBy: { datum: "desc" } });
  return NextResponse.json({
    jaar, vergoedingPerKm: KM_VERGOEDING,
    regels: regels.map((r) => ({ id: r.id, datum: r.datum.toISOString(), van: r.van, naar: r.naar, km: r.km, retour: r.retour, doel: r.doel, vervoer: r.vervoer, vergoeding: r.vergoeding })),
    totaalKm: rond(regels.reduce((s, r) => s + r.km, 0)),
    totaalVergoeding: rond(regels.reduce((s, r) => s + r.vergoeding, 0)),
  });
});
