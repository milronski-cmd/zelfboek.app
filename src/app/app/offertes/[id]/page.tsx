import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro } from "@/lib/btw";
import { parseRegels } from "@/lib/facturen/bereken";
import { statusPil, statusTekst } from "@/lib/facturen/status";
import { offerteNaarFactuur, offerteStatus, offerteVerzenden } from "@/lib/acties-facturen";
import { Kaart, Kop, Pil, knopLicht } from "@/components/ui";
import { ActieKnop } from "../../facturen/[id]/Acties";

export const instant = false;

export default async function OfferteDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const o = await huidigeOnderneming();
  const x = await db.offerte.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, facturen: { select: { id: true, nummer: true } } } });
  if (!x) notFound();
  const regels = parseRegels(x.regels);
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${basis}/offerte/${x.acceptToken}`;
  const verlopen = x.status === "verzonden" && x.geldigTot < new Date();
  const status = verlopen ? "verlopen" : x.status;

  return (
    <>
      <Kop titel={`Offerte ${x.nummer}`} sub={`${x.klant.naam}, ${datumNl(x.datum)}, geldig tot ${datumNl(x.geldigTot)}`}>
        {x.status === "concept" && <Link href={`/app/offertes/nieuw?id=${x.id}`} className={knopLicht}>Bewerken</Link>}
        <a href={`/api/offertes/${x.id}/pdf`} target="_blank" className={knopLicht}>PDF</a>
        {["concept", "verzonden"].includes(x.status) && <ActieKnop actie={offerteVerzenden} id={x.id} label={x.status === "concept" ? "Verzenden per e-mail" : "Opnieuw verzenden"} primair={x.status === "concept"} />}
        {x.status === "geaccepteerd" && <ActieKnop actie={offerteNaarFactuur} id={x.id} label="Factuur maken" primair />}
      </Kop>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <section className="kaart px-7 py-7 md:px-9 md:py-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-tekst-2">Voor</p>
              <p className="mt-0.5 font-medium">{x.klant.naam}</p>
            </div>
            <div className="text-right text-sm">
              <Pil kleur={statusPil[status] ?? "grijs"}>{status === "verzonden" ? "Wacht op klant" : statusTekst[status] ?? status}</Pil>
              {x.besluitOp && <p className="mt-2 text-tekst-2">Besluit van de klant op {datumNl(x.besluitOp)}</p>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.handtekening && <div className="mt-2 inline-block text-left"><img src={x.handtekening} alt={`Handtekening van ${x.getekendDoor ?? "de klant"}`} className="h-16 w-auto rounded border border-lijn bg-white" /><p className="text-[13px] text-tekst-2">Getekend door {x.getekendDoor}{x.getekendOp ? ` op ${datumNl(x.getekendOp)}` : ""}</p></div>}
            </div>
          </div>
          <table className="tabel mt-6 [&_td]:px-0 [&_th]:px-0">
            <thead>
              <tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Prijs</th><th className="num">Bedrag</th></tr>
            </thead>
            <tbody>
              {regels.map((r, i) => (
                <tr key={i}><td>{r.omschrijving}</td><td className="num">{r.aantal}{r.eenheid ? ` ${r.eenheid}` : ""}</td><td className="num">{euro(r.prijs)}</td><td className="num">{euro(r.aantal * r.prijs)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto mt-5 w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-tekst-2">Subtotaal</span><span className="tabular">{euro(x.subtotaal)}</span></div>
            <div className="flex justify-between"><span className="text-tekst-2">Btw</span><span className="tabular">{euro(x.btw)}</span></div>
            <div className="flex justify-between border-t border-lijn-2 pt-2 text-base font-semibold"><span>Totaal</span><span className="cijfer text-[18px]">{euro(x.totaal)}</span></div>
          </div>
          {x.opmerking && <p className="mt-5 whitespace-pre-line border-t border-lijn pt-4 text-sm text-tekst-2">{x.opmerking}</p>}
          {x.facturen.length > 0 && (
            <p className="mt-4 text-sm text-tekst-2">Gefactureerd als {x.facturen.map((f) => <Link key={f.id} href={`/app/facturen/${f.id}`} className="underline">{f.nummer}</Link>)}</p>
          )}
        </section>

        <aside className="space-y-6">
          {["verzonden", "concept"].includes(x.status) && (
            <Kaart titel="Besluit van de klant zelf invoeren">
              <div className="flex flex-col items-start gap-2 px-5 py-4">
                <p className="text-sm text-tekst-2">Heeft de klant per mail of telefoon gereageerd? Leg het hier vast.</p>
                <form action={offerteStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="geaccepteerd" /><button className={knopLicht}>Geaccepteerd</button></form>
                <form action={offerteStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="afgewezen" /><button className="knop-tekst">Afgewezen</button></form>
              </div>
            </Kaart>
          )}
          <Kaart titel="Link voor de klant">
            <div className="px-5 py-4 text-sm">
              <p className="text-tekst-2">Hiermee accepteert of weigert de klant online, zonder in te loggen.</p>
              <a href={link} target="_blank" className="mt-2 block break-all text-primair-tekst underline">{link}</a>
            </div>
          </Kaart>
        </aside>
      </div>
    </>
  );
}
