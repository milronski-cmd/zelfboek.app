import { NextResponse } from "next/server";
import { huidigeSessie } from "@/lib/auth";
import { db } from "@/lib/db";
import { rondAutorisatieAf, syncSaltEdge } from "@/lib/bank/saltedge";
import { leesState } from "@/lib/koppelen";

/**
 * Terugkeer van Salt Edge na het inloggen bij de bank: /callback/<ondertekende state>?connection_id=...(&error_class=...).
 * De state staat in het pad, zodat Salt Edge er gewoon ?connection_id= achter kan zetten.
 */
export async function GET(req: Request, { params }: { params: Promise<{ state: string }> }) {
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const st = leesState(decodeURIComponent((await params).state), 1);
  const ondernemingId = st?.s === "saltedge" ? st.o : null;
  const connectionId = url.searchParams.get("connection_id");
  const fout = url.searchParams.get("error_class");
  const terug = (q: string) => NextResponse.redirect(`${basis}/app/koppelingen?${q}`, 303);

  const sessie = await huidigeSessie();
  if (!sessie) return NextResponse.redirect(`${basis}/login`, 303);
  if (fout) return terug(`fout=${encodeURIComponent(fout === "UserAbort" || fout === "AccessDenied" ? "Je hebt het koppelen bij de bank afgebroken. Probeer het gerust opnieuw." : "De bank gaf een fout. Probeer het over een paar minuten opnieuw.")}`);
  if (!connectionId || !ondernemingId) return terug(`fout=${encodeURIComponent("Het koppelen is verlopen of niet gelukt. Probeer het opnieuw.")}`);

  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: sessie.gebruikerId, ondernemingId } } });
  if (!lid || lid.rol === "lezer" || sessie.meekijkerEmail) return terug(`fout=${encodeURIComponent("Je mag in deze onderneming geen bank koppelen.")}`);

  try {
    const aantal = await rondAutorisatieAf(ondernemingId, connectionId, st?.b);
    if (aantal === 0) return terug(`m=${encodeURIComponent("Gekoppeld. De bank wordt nog uitgelezen; over een paar minuten staan je rekeningen hier (of klik op Nu ophalen).")}`);
    const r = await syncSaltEdge(ondernemingId, new Date(Date.now() - 90 * 864e5));
    const extra = r.fouten.length ? ` Let op: ${r.fouten.join(" | ")}` : "";
    return terug(`m=${encodeURIComponent(`${aantal} rekening(en) gekoppeld, ${r.nieuw} regels opgehaald.${extra}`)}`);
  } catch (e) {
    console.error("saltedge", e instanceof Error ? e.message : e);
    return terug(`fout=${encodeURIComponent("De bank gaf een fout. Probeer het over een paar minuten opnieuw.")}`);
  }
}
