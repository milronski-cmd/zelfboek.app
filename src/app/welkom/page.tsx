import { redirect } from "next/navigation";
import Link from "next/link";
import { huidigeOnderneming, huidigeSessie, vereisGebruiker } from "@/lib/auth";
import { welkomOpslaan } from "@/lib/acties-instellingen";
import { MERK } from "@/lib/merk";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

/** Eerste keer ingelogd: twee vragen, dan meteen naar het overzicht. De rest vraagt het overzicht stap voor stap. */
export default async function WelkomPagina() {
  if (!(await huidigeSessie())) redirect("/login");
  const [o, s] = await Promise.all([huidigeOnderneming(), vereisGebruiker()]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Woordmerk size={18} />
      <section className="kaart mt-8 w-full max-w-md p-7">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Welkom bij {MERK}</h1>
        <p className="mt-1 text-sm text-tekst-2">Nog twee dingen, dan zie je je overzicht. Je kunt alles later aanpassen.</p>
        <form action={welkomOpslaan} className="mt-6 space-y-4">
          <div>
            <label className="lbl" htmlFor="naam">Je voornaam</label>
            <input id="naam" name="naam" autoComplete="given-name" defaultValue={s.gebruiker.naam ?? ""} placeholder="Bijvoorbeeld Sanne" className="veld" autoFocus />
          </div>
          <div>
            <label className="lbl" htmlFor="bedrijf">Naam van je bedrijf</label>
            <input id="bedrijf" name="bedrijf" autoComplete="organization" defaultValue={o.naam === "Mijn onderneming" ? "" : o.naam} placeholder="Bijvoorbeeld Studio Sanne" className="veld" />
          </div>
          <button className="knop knop-groot w-full justify-center">Naar mijn overzicht</button>
        </form>
        <p className="mt-4 text-center"><Link href="/app" className="knop-tekst knop-klein">Overslaan</Link></p>
      </section>
    </main>
  );
}
