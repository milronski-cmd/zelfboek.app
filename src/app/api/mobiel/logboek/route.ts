import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";

/** Logboek: wie deed wat, nieuwste eerst. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const regels = await db.logboek.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 300 });
  return NextResponse.json({ regels: regels.map((r) => ({ id: r.id, wie: r.wie, actie: r.actie, onderwerp: r.onderwerp, aangemaakt: r.aangemaakt.toISOString() })) });
});
