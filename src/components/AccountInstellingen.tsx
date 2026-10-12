import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ontsleutel } from "@/lib/crypto";
import { otpauthUrl } from "@/lib/tweestap";
import { passkeyVerwijderen, tweestapAan, tweestapStart, tweestapUit } from "@/lib/acties-instellingen";
import { datumKort } from "@/lib/btw";
import { FormulierMetMelding } from "./FormulierMetMelding";
import { PasskeyToevoegen } from "./Passkey";
import { ThemaKiezer } from "./ThemaKiezer";

/** Instellingen > Inloggen en weergave: licht/donker, Face ID/vingerafdruk en tweestapsverificatie. */
export async function AccountInstellingen({ gebruikerId, thema, koppel }: { gebruikerId: string; thema: string; koppel: boolean }) {
  const g = await db.gebruiker.findUniqueOrThrow({ where: { id: gebruikerId }, include: { passkeys: { orderBy: { aangemaakt: "asc" } } } });
  const geheim = koppel && g.totpGeheim && !g.totpAan ? ontsleutel(g.totpGeheim) : null;
  const qr = geheim ? await QRCode.toDataURL(otpauthUrl(g.email, geheim), { margin: 1, width: 200 }) : null;
  const kaart = "kaart max-w-2xl space-y-4 p-6";
  return (
    <div className="space-y-6">
      <div className={kaart}><ThemaKiezer huidig={thema} /></div>

      <section className={kaart}>
        <div>
          <h2 className="text-sm font-semibold">Inloggen met Face ID of vingerafdruk</h2>
          <p className="mt-0.5 text-[13px] text-tekst-2">Geen code meer nodig op je eigen telefoon of computer. Je gezicht of vinger verlaat je apparaat nooit.</p>
        </div>
        {g.passkeys.length > 0 && (
          <ul className="divide-y divide-lijn rounded-lg border border-lijn">
            {g.passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{p.naam ?? "Apparaat"} <span className="text-[13px] text-tekst-3">toegevoegd {datumKort(p.aangemaakt)}{p.laatstGebruikt ? `, laatst gebruikt ${datumKort(p.laatstGebruikt)}` : ""}</span></span>
                <form action={passkeyVerwijderen}><input type="hidden" name="id" value={p.id} /><button className="knop-tekst text-rood-tekst">Verwijderen</button></form>
              </li>
            ))}
          </ul>
        )}
        <PasskeyToevoegen />
      </section>

      <section className={kaart}>
        <div>
          <h2 className="text-sm font-semibold">Tweestapsverificatie <span className="font-normal text-tekst-3">(voor wie wil)</span></h2>
          <p className="mt-0.5 text-[13px] text-tekst-2">Naast de code per e-mail vraagt Saldoplan dan ook een code uit een app op je telefoon, zoals Google Authenticator of Microsoft Authenticator.</p>
        </div>
        {g.totpAan ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-groen-tekst">Staat aan.</span>
            <form action={tweestapUit}><button className="knop-licht">Uitzetten</button></form>
          </div>
        ) : geheim && qr ? (
          <div className="space-y-3">
            <ol className="space-y-1 text-sm">
              <li>1. Open je authenticator-app en kies &ldquo;account toevoegen&rdquo;.</li>
              <li>2. Scan deze code (of tik op de link als je op je telefoon bent).</li>
              <li>3. Vul de 6 cijfers in die de app laat zien.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href={otpauthUrl(g.email, geheim)}><img src={qr} alt="QR-code voor je authenticator-app" width={180} height={180} className="rounded-lg border border-lijn bg-white" /></a>
            <p className="break-all text-[13px] text-tekst-3">Lukt scannen niet? Typ deze sleutel over: <span className="font-mono text-tekst">{geheim.replace(/(.{4})/g, "$1 ").trim()}</span></p>
            <FormulierMetMelding actie={tweestapAan} knopTekst="Aanzetten" className="flex flex-wrap items-end gap-2">
              <div><label className="lbl" htmlFor="totp">Code uit de app</label><input id="totp" name="code" inputMode="numeric" maxLength={7} autoComplete="one-time-code" className="veld w-36" /></div>
            </FormulierMetMelding>
          </div>
        ) : (
          <form action={tweestapStart}><button className="knop-licht">Tweestap aanzetten</button></form>
        )}
      </section>
    </div>
  );
}
