import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fout, mobielContext, route } from "@/lib/mobiel";
import { klantJson, offerteJson } from "@/lib/mobiel-json";

/** Eén offerte met klant, de facturen die eruit kwamen en de publieke accepteerlink. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o } = await mobielContext(req);
  const { id } = await params;
  const x = await db.offerte.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, facturen: { select: { id: true, nummer: true } } } });
  if (!x) return fout(404, "Offerte niet gevonden.");
  const basis = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return NextResponse.json({
    offerte: offerteJson(x),
    klant: klantJson(x.klant),
    facturen: x.facturen,
    link: `${basis}/offerte/${x.acceptToken}`,
    pdf: `/api/offertes/${x.id}/pdf`,
  });
});
