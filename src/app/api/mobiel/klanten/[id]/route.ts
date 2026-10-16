import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rond } from "@/lib/btw";
import { OPEN_STATUS } from "@/lib/facturen/status";
import { fout, mobielContext, route } from "@/lib/mobiel";
import { factuurJson, klantJson, offerteJson } from "@/lib/mobiel-json";

/** Eén klant met facturen, offertes en open uren. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { onderneming: o } = await mobielContext(req);
  const { id } = await params;
  const k = await db.klant.findFirst({ where: { id, ondernemingId: o.id }, include: { facturen: { orderBy: { datum: "desc" } }, offertes: { orderBy: { datum: "desc" }, take: 10 } } });
  if (!k) return fout(404, "Klant niet gevonden.");
  const openUren = await db.urenregel.aggregate({ where: { ondernemingId: o.id, klantId: k.id, gefactureerd: false, soort: "declarabel" }, _sum: { uren: true }, _count: true });
  return NextResponse.json({
    klant: klantJson(k),
    open: rond(k.facturen.filter((f) => OPEN_STATUS.includes(f.status)).reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0)),
    omzet: rond(k.facturen.filter((f) => f.status === "betaald").reduce((s, f) => s + f.subtotaal, 0)),
    facturen: k.facturen.map((f) => factuurJson({ ...f, klant: { naam: k.naam, email: k.email } })),
    offertes: k.offertes.map((x) => offerteJson({ ...x, klant: { naam: k.naam, email: k.email } })),
    openUren: { uren: openUren._sum.uren ?? 0, aantal: openUren._count },
  });
});
