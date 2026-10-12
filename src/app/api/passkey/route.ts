import { NextResponse } from "next/server";
import { huidigeSessie, maakSessie } from "@/lib/auth";
import { controleerLogin, loginOpties, registratieOpties, registreer } from "@/lib/passkey";
import { logboek } from "@/lib/logboek";

/**
 * Passkeys (Face ID / vingerafdruk). POST { stap }:
 * "registreer-opties" en "registreer" (ingelogd), "login-opties" en "login" (niet ingelogd).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { stap?: string; antwoord?: unknown; naam?: string };
  try {
    if (body.stap === "login-opties") return NextResponse.json(await loginOpties());
    if (body.stap === "login") {
      const gebruikerId = await controleerLogin(body.antwoord as never);
      const { nieuw } = await maakSessie(gebruikerId);
      return NextResponse.json({ ok: true, naar: nieuw ? "/welkom" : "/app" });
    }
    const sessie = await huidigeSessie();
    if (!sessie) return NextResponse.json({ fout: "Log eerst in." }, { status: 401 });
    if (body.stap === "registreer-opties") return NextResponse.json(await registratieOpties(sessie.gebruiker));
    if (body.stap === "registreer") {
      await registreer(sessie.gebruikerId, body.antwoord as never, body.naam);
      if (sessie.actieveOndernemingId) await logboek(sessie.actieveOndernemingId, sessie.gebruiker.email, "Inloggen met Face ID of vingerafdruk aangezet", body.naam);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ fout: "Onbekende stap." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ fout: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
