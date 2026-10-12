import { connection } from "next/server";
import { db } from "@/lib/db";
import { datumNl, euro } from "@/lib/btw";
import { parseRegels } from "@/lib/facturen/bereken";
import { offerteBesluit } from "@/lib/acties-facturen";
import { Handtekening } from "@/components/Handtekening";

export const instant = false;

export default async function PubliekeOfferte({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ m?: string; fout?: string }> }) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const x = await db.offerte.findUnique({ where: { acceptToken: token }, include: { klant: true, onderneming: true } });
  if (!x || x.status === "concept") {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="max-w-sm text-center text-tekst-2">Deze offerte bestaat niet of de link klopt niet meer. Vraag de afzender om een nieuwe link.</p>
      </main>
    );
  }
  const regels = parseRegels(x.regels);
  const afgehandeld = ["geaccepteerd", "afgewezen", "gefactureerd"].includes(x.status);
  const verlopen = x.geldigTot < new Date();

  async function besluit(fd: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    const keuze = fd.get("keuze") === "ja" ? "geaccepteerd" : "afgewezen";
    const r = await offerteBesluit(token, keuze, { handtekening: String(fd.get("handtekening") ?? ""), naam: String(fd.get("getekendDoor") ?? "") });
    // Vaste codes in de link, geen vrije tekst (anders kan iemand eigen tekst op deze pagina zetten).
    const code = r.ok ? `m=${keuze === "geaccepteerd" ? "ja" : "nee"}` : `fout=${r.fout.includes("handtekening") ? "teken" : r.fout.includes("verlopen") ? "verlopen" : r.fout.includes("afgehandeld") ? "klaar" : "fout"}`;
    redirect(`/offerte/${token}?${code}`);
  }

  return (
    <main className="flex-1 px-5 py-10 md:py-16">
      <article className="kaart mx-auto max-w-2xl px-7 py-8 md:px-10 md:py-10">
        <p className="text-sm text-tekst-2">Offerte van</p>
        <h1 className="mt-0.5 text-[26px] font-semibold leading-tight">{x.onderneming.naam}</h1>
        <p className="mt-3 text-tekst-2">Voor {x.klant.naam}. Nummer {x.nummer}, gemaakt op {datumNl(x.datum)} en geldig tot {datumNl(x.geldigTot)}.</p>

        <table className="tabel mt-7 [&_td]:px-0 [&_th]:px-0 [&_td.num]:pl-4 [&_th.num]:pl-4">
          <thead><tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Bedrag</th></tr></thead>
          <tbody>{regels.map((r, i) => <tr key={i}><td>{r.omschrijving}</td><td className="num">{r.aantal}{r.eenheid ? ` ${r.eenheid}` : ""}</td><td className="num">{euro(r.aantal * r.prijs)}</td></tr>)}</tbody>
        </table>
        <div className="ml-auto mt-5 w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-tekst-2">Subtotaal</span><span className="tabular">{euro(x.subtotaal)}</span></div>
          <div className="flex justify-between"><span className="text-tekst-2">Btw</span><span className="tabular">{euro(x.btw)}</span></div>
          <div className="flex justify-between border-t border-lijn-2 pt-2 text-base font-semibold"><span>Totaal</span><span className="cijfer text-[18px]">{euro(x.totaal)}</span></div>
        </div>
        {x.opmerking && <p className="mt-5 whitespace-pre-line border-t border-lijn pt-4 text-sm text-tekst-2">{x.opmerking}</p>}

        {sp.m && <p className="mt-6 rounded-lg bg-groen-licht px-4 py-3 text-sm text-groen-tekst">{sp.m === "ja" ? "Bedankt, de offerte is geaccepteerd." : "De offerte is afgewezen."}</p>}
        {sp.fout && <p className="mt-6 rounded-lg bg-rood-licht px-4 py-3 text-sm text-rood-tekst">{({ teken: "Zet je naam en handtekening om de offerte te accepteren.", verlopen: "Deze offerte is verlopen.", klaar: "Deze offerte is al afgehandeld." } as Record<string, string>)[sp.fout] ?? "Dat lukte niet. Probeer het opnieuw."}</p>}

        {afgehandeld ? (
          <div className="mt-8 text-sm text-tekst-2">
            <p>Deze offerte is {x.status === "gefactureerd" ? "geaccepteerd en gefactureerd" : x.status}{x.besluitOp ? ` op ${datumNl(x.besluitOp)}` : ""}.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {x.handtekening && <div className="mt-3"><img src={x.handtekening} alt={`Handtekening van ${x.getekendDoor ?? "de klant"}`} className="h-20 w-auto rounded border border-lijn bg-white" /><p className="mt-1 text-[13px]">Getekend door {x.getekendDoor}</p></div>}
          </div>
        ) : verlopen ? (
          <p className="mt-8 text-sm text-tekst-2">Deze offerte is verlopen. Vraag {x.onderneming.email ?? x.onderneming.naam} om een nieuwe.</p>
        ) : (
          <>
            <form action={besluit} className="mt-8 border-t border-lijn pt-6">
              <h2 className="mb-3 text-[16px] font-semibold">Akkoord? Teken hieronder</h2>
              <Handtekening knop="Offerte ondertekenen" />
            </form>
            <form action={besluit} className="mt-3">
              <button name="keuze" value="nee" className="knop-tekst knop-klein">Nee, ik wijs de offerte af</button>
            </form>
          </>
        )}
        <p className="mt-8 text-[13px] text-tekst-3">Door te ondertekenen ga je akkoord met de offerte zoals hierboven staat. Je ontvangt daarna een factuur van {x.onderneming.naam}.</p>
      </article>
    </main>
  );
}
