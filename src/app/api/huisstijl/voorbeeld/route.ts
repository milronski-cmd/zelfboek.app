import { NextResponse } from "next/server";
import { huidigeOnderneming } from "@/lib/db";
import { voorbeeldPdf } from "@/lib/facturen/pdf";
import { huisstijlUitFormulier } from "@/lib/facturen/huisstijl-formulier";

/** Voorbeeld-PDF met de (nog niet opgeslagen) huisstijl uit het formulier onder Instellingen, Huisstijl. */
export async function POST(req: Request) {
  return voorbeeld(await req.formData());
}

/** Zelfde voorbeeld via de querystring (de app opent PDF's met een GET en het bearer-token). */
export async function GET(req: Request) {
  const fd = new FormData();
  new URL(req.url).searchParams.forEach((v, k) => fd.set(k, v));
  return voorbeeld(fd);
}

async function voorbeeld(fd: FormData) {
  const o = await huidigeOnderneming();
  const r = await huisstijlUitFormulier(fd);
  if (typeof r === "string") return NextResponse.json({ fout: r }, { status: 400 });
  const buf = await voorbeeldPdf(o, fd.get("soort") === "offerte" ? "offerte" : "factuur", r.stijl);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=voorbeeld.pdf", "Cache-Control": "no-store" },
  });
}
