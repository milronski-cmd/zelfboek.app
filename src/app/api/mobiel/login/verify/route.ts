import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { controleerLoginCode, nieuweSessie } from "@/lib/auth";
import { klantIp } from "@/lib/limiet";
import { fout, route } from "@/lib/mobiel";

/**
 * Stap 2 van inloggen in de app: code controleren, sessie aanmaken en het token teruggeven.
 * Precies dezelfde controle als de webapp (limieten, tweestap), maar het token gaat in de body i.p.v. een cookie.
 */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string; appCode?: string };
  const e = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!e || !code) return fout(400, "E-mailadres en code zijn verplicht.");
  const r = await controleerLoginCode(e, code, body.appCode, await klantIp(req));
  if (!r.ok) return fout(400, r.melding);
  const { token } = await nieuweSessie(r.gebruikerId);
  const gebruiker = await db.gebruiker.findUniqueOrThrow({ where: { id: r.gebruikerId } });
  const lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: gebruiker.id }, include: { onderneming: { select: { id: true, naam: true } } } });
  return NextResponse.json({
    token,
    gebruiker: { email: gebruiker.email, naam: gebruiker.naam },
    onderneming: lid ? { id: lid.onderneming.id, naam: lid.onderneming.naam } : null,
  });
});
