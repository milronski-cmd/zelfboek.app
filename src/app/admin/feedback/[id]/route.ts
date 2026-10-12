import { db } from "@/lib/db";
import { huidigeSessie } from "@/lib/auth";
import { isBeheerder } from "@/lib/beheer";

/** Schermafbeelding bij feedback: alleen voor een beheerder met tweestap, nooit gecachet. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await huidigeSessie();
  if (!s || s.meekijkerEmail || !isBeheerder(s.gebruiker.email) || !s.gebruiker.totpAan) return new Response("Niet gevonden", { status: 404 });
  const { id } = await params;
  const f = await db.feedback.findUnique({ where: { id }, select: { schermafbeelding: true, schermMime: true } });
  if (!f?.schermafbeelding || !f.schermMime) return new Response("Niet gevonden", { status: 404 });
  return new Response(Buffer.from(f.schermafbeelding), {
    headers: { "content-type": f.schermMime, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
