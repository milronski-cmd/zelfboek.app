import { MERK, WEBSITE_URL } from "@/lib/merk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { heeftTweestap, huidigeSessie, logInMetCode, stuurLoginCode } from "@/lib/auth";
import { PasskeyLogin } from "@/components/Passkey";
import { Melding, knop, knopTekst, veld } from "@/components/ui";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

export default async function Login({ searchParams }: { searchParams: Promise<{ email?: string; m?: string; fout?: string }> }) {
  if (await huidigeSessie()) redirect("/app");
  const sp = await searchParams;
  const tweestap = sp.email ? await heeftTweestap(sp.email) : false;

  async function stap1(fd: FormData) {
    "use server";
    const email = String(fd.get("email") ?? "");
    const r = await stuurLoginCode(email);
    if (!r.ok) redirect(`/login?fout=${encodeURIComponent(r.melding)}`);
    redirect(`/login?email=${encodeURIComponent(email)}&m=${encodeURIComponent(r.melding)}`);
  }
  async function stap2(fd: FormData) {
    "use server";
    const email = String(fd.get("email") ?? "");
    const r = await logInMetCode(email, String(fd.get("code") ?? ""), String(fd.get("appCode") ?? "") || undefined);
    if (!r.ok) redirect(`/login?email=${encodeURIComponent(email)}&fout=${encodeURIComponent(r.melding)}`);
    redirect(r.nieuw ? "/welkom" : "/app");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <a href={WEBSITE_URL} className="inline-block" aria-label={MERK}><Woordmerk size={20} /></a>
        <div className="kaart mt-6 p-7">
          {!sp.email ? (
            <>
              <h1 className="text-[24px] font-semibold">Inloggen</h1>
              <p className="mt-1 text-sm text-tekst-2">Geen wachtwoord nodig. Je krijgt een code per e-mail.</p>
              {sp.fout && <div className="mt-4"><Melding r={{ ok: false, fout: sp.fout }} /></div>}
              <form action={stap1} className="mt-5 space-y-3">
                <div>
                  <label className="lbl" htmlFor="email">E-mailadres</label>
                  <input id="email" name="email" type="email" autoComplete="email" required placeholder="jij@bedrijf.nl" autoFocus className={veld} />
                </div>
                <button className={`${knop} knop-groot w-full`}>Stuur mij een code</button>
              </form>
              <PasskeyLogin />
            </>
          ) : (
            <>
              <h1 className="text-[24px] font-semibold">Vul je code in</h1>
              <p className="mt-1 text-sm text-tekst-2">Verstuurd naar {sp.email}. De code is tien minuten geldig.</p>
              {sp.m && <div className="mt-4"><Melding r={{ ok: true, melding: sp.m }} /></div>}
              {sp.fout && <div className="mt-4"><Melding r={{ ok: false, fout: sp.fout }} /></div>}
              <form action={stap2} className="mt-5 space-y-3">
                <input type="hidden" name="email" value={sp.email} />
                <div>
                  <label className="lbl" htmlFor="code">Code uit de e-mail</label>
                  <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" autoFocus className={`${veld} cijfer text-center text-[26px] tracking-[0.4em]`} />
                </div>
                {tweestap && (
                  <div>
                    <label className="lbl" htmlFor="appCode">Code uit je authenticator-app</label>
                    <input id="appCode" name="appCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required placeholder="000000" className={`${veld} cijfer text-center text-[20px] tracking-[0.3em]`} />
                  </div>
                )}
                <button className={`${knop} knop-groot w-full`}>Inloggen</button>
                <Link href="/login" className={`${knopTekst} w-full justify-center`}>Ander e-mailadres</Link>
              </form>
            </>
          )}
        </div>
        <p className="mt-5 text-center text-[13px] text-tekst-3">Nieuw hier? Vul je e-mailadres in, dan maken we meteen een account aan. Dertig dagen gratis proberen.</p>
        <p className="mt-3 text-center text-[13px] text-tekst-3"><Link href="/gegevens" className="underline">Zo bewaren we je gegevens</Link> · <Link href="/status" className="underline">Status</Link></p>
      </div>
    </main>
  );
}
