import { NextResponse } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { offertePdf } from "@/lib/facturen/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await huidigeOnderneming();
  const x = await db.offerte.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, onderneming: true } });
  if (!x) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  const buf = await offertePdf(x);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${x.nummer}.pdf`)}` },
  });
}
