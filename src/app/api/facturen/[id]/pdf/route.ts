import { NextResponse } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { factuurPdf } from "@/lib/facturen/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await huidigeOnderneming();
  const f = await db.factuur.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, onderneming: true } });
  if (!f) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  const buf = await factuurPdf(f);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${f.nummer}.pdf`)}` },
  });
}
