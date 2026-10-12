import { redirect } from "next/navigation";
import Link from "next/link";
import { huidigeOnderneming, huidigeSessie, vereisGebruiker } from "@/lib/auth";
import { welkomOpslaan, welkomVragen } from "@/lib/acties-instellingen";
import { MERK } from "@/lib/merk";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

/** Eén vraag met grote keuzeknoppen (radio's die op knoppen lijken). */
function Keuze({ naam, vraag, uitleg, opties, standaard }: { naam: string; vraag: string; uitleg?: string; opties: [string, string][]; standaard: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{vraag}</legend>
      {uitleg && <p className="mt-0.5 text-[13px] text-tekst-2">{uitleg}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {opties.map(([waarde, label]) => (
          <label key={waarde} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-lijn-2 px-3 py-2.5 text-sm has-[:checked]:border-primair has-[:checked]:bg-primair-licht">
            <input type="radio" name={naam} value={waarde} defaultChecked={waarde === standaard} className="h-4 w-4 accent-[var(--primair)]" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Aanmelden in drie stappen: wie ben je, drie vragen, bank koppelen. Daarna staat alles goed. */
export default async function WelkomPagina({ searchParams }: { searchParams: Promise<{ stap?: string }> }) {
  if (!(await huidigeSessie())) redirect("/login");
  const stap = Math.min(3, Math.max(1, Number((await searchParams).stap) || 1));
  const [o, s] = await Promise.all([huidigeOnderneming(), vereisGebruiker()]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Woordmerk size={18} />
      <section className="kaart mt-6 w-full max-w-md p-6 sm:p-7">
        <ol className="mb-5 flex gap-2" aria-label={`Stap ${stap} van 3`}>
          {[1, 2, 3].map((n) => <li key={n} className={`h-1.5 flex-1 rounded-full ${n <= stap ? "bg-primair" : "bg-lijn"}`} />)}
        </ol>

        {stap === 1 && (
          <>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Welkom bij {MERK}</h1>
            <p className="mt-1 text-sm text-tekst-2">Drie korte stappen, dan staat je administratie klaar. Alles kun je later aanpassen.</p>
            <form action={welkomOpslaan} className="mt-6 space-y-4">
              <div>
                <label className="lbl" htmlFor="naam">Je voornaam</label>
                <input id="naam" name="naam" autoComplete="given-name" defaultValue={s.gebruiker.naam ?? ""} placeholder="Bijvoorbeeld Sanne" className="veld" autoFocus />
              </div>
              <div>
                <label className="lbl" htmlFor="bedrijf">Naam van je bedrijf</label>
                <input id="bedrijf" name="bedrijf" autoComplete="organization" defaultValue={o.naam === "Mijn onderneming" ? "" : o.naam} placeholder="Bijvoorbeeld Studio Sanne" className="veld" />
              </div>
              <div>
                <label className="lbl" htmlFor="kvk">KvK-nummer <span className="font-normal text-tekst-3">(mag later)</span></label>
                <input id="kvk" name="kvk" inputMode="numeric" pattern="[0-9 ]{8,9}" maxLength={9} defaultValue={o.kvk ?? ""} placeholder="8 cijfers" className="veld" />
              </div>
              <button className="knop knop-groot w-full justify-center">Volgende</button>
            </form>
          </>
        )}

        {stap === 2 && (
          <>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Drie vragen over je bedrijf</h1>
            <p className="mt-1 text-sm text-tekst-2">Daarmee zet {MERK} je btw en belasting goed. Twijfel je? Laat de keuze staan.</p>
            <form action={welkomVragen} className="mt-6 space-y-5">
              <Keuze naam="btw" vraag="Reken je btw op je facturen?" uitleg="Doe je mee aan de kleineondernemersregeling (KOR), dan reken je geen btw." opties={[["ja", "Ja, ik reken btw"], ["kor", "Nee, ik doe mee aan de KOR"]]} standaard={o.korDeelnemer ? "kor" : "ja"} />
              <Keuze naam="starter" vraag="Ben je in de laatste vijf jaar begonnen?" uitleg="Dan krijg je misschien extra aftrek in je inkomstenbelasting (startersaftrek)." opties={[["ja", "Ja"], ["nee", "Nee"]]} standaard={o.starter ? "ja" : "nee"} />
              <Keuze naam="uren" vraag="Werk je zo'n 24 uur per week of meer aan je bedrijf?" uitleg="Dat zijn 1.225 uur per jaar. Dan krijg je de zelfstandigenaftrek." opties={[["ja", "Ja"], ["nee", "Nee, minder"]]} standaard={o.urencriterium ? "ja" : "nee"} />
              <button className="knop knop-groot w-full justify-center">Volgende</button>
            </form>
          </>
        )}

        {stap === 3 && (
          <>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Koppel je bank</h1>
            <p className="mt-1 text-sm text-tekst-2">Je logt in bij je eigen bank. Daarna boekt {MERK} elke nacht je betalingen en zie je wat je echt kunt uitgeven. Overmaken kan {MERK} nooit.</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/app/koppelingen" className="knop knop-groot w-full justify-center">Bank koppelen</Link>
              <Link href="/app" className="knop-licht knop-groot w-full justify-center">Later, eerst rondkijken</Link>
            </div>
          </>
        )}

        {stap < 3 && <p className="mt-4 text-center"><Link href="/app" className="knop-tekst knop-klein">Overslaan</Link></p>}
      </section>
    </main>
  );
}
