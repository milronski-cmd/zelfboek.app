import { redirect } from "next/navigation";
import Link from "next/link";
import { MERK } from "@/lib/merk";
import { startDemo } from "@/lib/demo-omgeving";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

/** Probeer zonder aanmelden: een voorbeeldbedrijf met een jaar aan gegevens, weg na 24 uur. */
export default async function Demo({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  const { fout } = await searchParams;
  async function start() {
    "use server";
    const r = await startDemo();
    redirect(r.ok ? "/app" : `/demo?fout=${r.fout.includes("over een uur") ? "limiet" : "druk"}`);
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <Woordmerk />
      <section className="kaart mt-6 w-full max-w-md p-6 text-center">
        <h1 className="text-[22px] font-semibold">Probeer {MERK} zonder aanmelden</h1>
        <p className="mt-2 text-sm text-tekst-2">Je komt in een voorbeeldbedrijf met een jaar aan betalingen, facturen en bonnen. Klik overal op; er wordt niets echt verstuurd. Na 24 uur verdwijnt alles.</p>
        {fout && <p className="mt-4 rounded-lg bg-rood-licht px-4 py-3 text-sm text-rood-tekst">{fout === "limiet" ? "Je hebt net al een paar voorbeeldomgevingen gestart. Probeer het over een uur opnieuw, of maak gratis een account." : "Het is even erg druk. Probeer het over een paar minuten opnieuw, of maak gratis een account."}</p>}
        <form action={start} className="mt-6"><button className="knop knop-groot w-full justify-center">Start de voorbeeldomgeving</button></form>
        <p className="mt-4 text-[13px] text-tekst-3">Liever meteen je eigen administratie? <Link href="/login" className="underline">Maak gratis een account</Link>.</p>
      </section>
    </main>
  );
}
