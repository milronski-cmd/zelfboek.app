import { db } from "@/lib/db";
import { factuurPdf } from "@/lib/facturen/pdf";
import { leesFactuurToken, markeerGeopend } from "@/lib/facturen/link";

/** De factuur als PDF voor de klant (via de ondertekende link). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = leesFactuurToken((await params).token);
  const f = id ? await db.factuur.findUnique({ where: { id }, include: { klant: true, onderneming: true } }) : null;
  if (!f || f.status === "concept") return new Response("Niet gevonden", { status: 404 });
  if (!new URL(req.url).searchParams.has("voorbeeld")) await markeerGeopend(f.id);
  const pdf = await factuurPdf(f);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${f.nummer}.pdf"` } });
}
