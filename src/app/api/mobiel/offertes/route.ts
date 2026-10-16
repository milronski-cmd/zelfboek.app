import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";
import { offerteJson } from "@/lib/mobiel-json";

/** Offertes, nieuwste eerst. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const offertes = await db.offerte.findMany({ where: { ondernemingId: o.id }, orderBy: { datum: "desc" }, include: { klant: { select: { naam: true, email: true } } }, take: 300 });
  return NextResponse.json({ offertes: offertes.map(offerteJson) });
});
