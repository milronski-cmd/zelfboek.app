import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { huidigeOnderneming } from "@/lib/db";

/** Het logo van de huidige onderneming, voor de weergave onder Instellingen, Huisstijl. */
export async function GET() {
  const o = await huidigeOnderneming();
  const koppen = (mime: string) => ({ "Content-Type": mime, "Cache-Control": "private, no-store" });
  if (o.logo?.length && o.logoMime) return new NextResponse(new Uint8Array(o.logo), { headers: koppen(o.logoMime) });
  // Oudere ondernemingen: logo nog als bestand op schijf.
  if (o.logoPad && !o.logoPad.startsWith("db:") && existsSync(o.logoPad)) {
    const ext = o.logoPad.split(".").pop()?.toLowerCase();
    return new NextResponse(new Uint8Array(await readFile(o.logoPad)), { headers: koppen(ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg") });
  }
  return NextResponse.json({ fout: "Geen logo" }, { status: 404 });
}
