import { NextResponse } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { factuurUbl } from "@/lib/facturen/ubl";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await huidigeOnderneming();
  const f = await db.factuur.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, onderneming: true } });
  if (!f) return NextResponse.json({ fout: "Niet gevonden" }, { status: 404 });
  const xml = await factuurUbl(f);
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${f.nummer}.xml`)}` },
  });
}
