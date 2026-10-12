import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { hash, ontsleutel, willekeurigToken } from "@/lib/crypto";
import { controleerCode } from "@/lib/tweestap";
import { fout, route } from "@/lib/mobiel";

const SESSIE_DAGEN = 30;

/**
 * Stap 2 van inloggen in de app: code controleren, sessie aanmaken en het token teruggeven.
 * Zelfde regels als de webapp (één open code, max 5 pogingen), maar het token gaat in de body i.p.v. een cookie.
 */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string; appCode?: string };
  const e = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!e || !code) return fout(400, "E-mailadres en code zijn verplicht.");
  const gebruiker = await db.gebruiker.findUnique({ where: { email: e } });
  if (!gebruiker) return fout(400, "Onbekend e-mailadres.");

  const open = await db.loginCode.findFirst({ where: { gebruikerId: gebruiker.id, gebruiktOp: null, verlooptOp: { gt: new Date() } }, orderBy: { aangemaakt: "desc" } });
  if (!open || open.pogingen >= 5) return fout(400, "Code verlopen of te vaak fout. Vraag een nieuwe code aan.");
  const gegeven = hash(code);
  if (gegeven.length !== open.codeHash.length || !timingSafeEqual(Buffer.from(gegeven), Buffer.from(open.codeHash))) {
    await db.loginCode.update({ where: { id: open.id }, data: { pogingen: { increment: 1 } } });
    const over = 4 - open.pogingen;
    return fout(400, `Code onjuist. Nog ${over} ${over === 1 ? "poging" : "pogingen"}.`);
  }
  if (gebruiker.totpAan && gebruiker.totpGeheim && !(body.appCode && controleerCode(ontsleutel(gebruiker.totpGeheim), body.appCode))) {
    await db.loginCode.update({ where: { id: open.id }, data: { pogingen: { increment: 1 } } });
    return fout(400, body.appCode ? "De code uit je authenticator-app klopt niet." : "Vul ook de code uit je authenticator-app in (tweestapsverificatie).");
  }
  await db.loginCode.update({ where: { id: open.id }, data: { gebruiktOp: new Date() } });

  const token = willekeurigToken();
  const lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: gebruiker.id }, include: { onderneming: { select: { id: true, naam: true } } } });
  await db.sessie.create({
    data: { gebruikerId: gebruiker.id, tokenHash: hash(token), verlooptOp: new Date(Date.now() + SESSIE_DAGEN * 864e5), actieveOndernemingId: lid?.ondernemingId ?? null },
  });
  await db.gebruiker.update({ where: { id: gebruiker.id }, data: { laatstActief: new Date() } });
  return NextResponse.json({
    token,
    gebruiker: { email: gebruiker.email, naam: gebruiker.naam },
    onderneming: lid ? { id: lid.onderneming.id, naam: lid.onderneming.naam } : null,
  });
});
