import { NextResponse } from "next/server";
import { appCodeKlopt, huidigeSessie, maakSessie } from "@/lib/auth";
import { binnenLimiet, klantIp, UUR } from "@/lib/limiet";
import { controleerLogin, loginOpties, PASSKEY_MELDINGEN as EIGEN, registratieOpties, registreer } from "@/lib/passkey";
import { logboek } from "@/lib/logboek";

/**
 * Passkeys (Face ID / vingerafdruk). POST { stap }:
 * "registreer-opties" en "registreer" (ingelogd), "login-opties" en "login" (niet ingelogd).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { stap?: string; antwoord?: unknown; naam?: string; appCode?: string };
  try {
    if (body.stap === "login-opties") return NextResponse.json(await loginOpties());
    if (body.stap === "login") {
      if (!(await binnenLimiet(`passkey-ip:${await klantIp(req)}`, 30, UUR))) return NextResponse.json({ fout: "Te veel pogingen. Probeer het over een uur opnieuw." }, { status: 429 });
      const gebruikerId = await controleerLogin(body.antwoord as never);
      const { nieuw } = await maakSessie(gebruikerId);
      return NextResponse.json({ ok: true, naar: nieuw ? "/welkom" : "/app" });
    }
    const sessie = await huidigeSessie();
    if (!sessie) return NextResponse.json({ fout: "Log eerst in." }, { status: 401 });
    if (body.stap === "registreer-opties") return NextResponse.json(await registratieOpties(sessie.gebruiker));
    if (body.stap === "registreer") {
      // Met tweestap aan mag alleen wie ook de app-code heeft een apparaat toevoegen.
      if (sessie.gebruiker.totpAan && !(await appCodeKlopt(sessie.gebruiker, body.appCode))) return NextResponse.json({ fout: "De code uit je authenticator-app klopt niet." }, { status: 400 });
      await registreer(sessie.gebruikerId, body.antwoord as never, body.naam);
      if (sessie.actieveOndernemingId) await logboek(sessie.actieveOndernemingId, sessie.gebruiker.email, "Inloggen met Face ID of vingerafdruk aangezet", body.naam);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ fout: "Onbekende stap." }, { status: 400 });
  } catch (e) {
    // Alleen onze eigen, begrijpelijke meldingen tonen; technische fouten niet.
    console.error("passkey", e);
    const m = e instanceof Error && EIGEN.has(e.message) ? e.message : "Het lukte niet met dit apparaat. Probeer het opnieuw of log in met je e-mail.";
    return NextResponse.json({ fout: m }, { status: 400 });
  }
}
