import Link from "next/link";
import { MERK } from "@/lib/merk";
import { Woordmerk } from "@/components/Merk";

export const metadata = { title: `Zo bewaren we je gegevens · ${MERK}` };

/**
 * Openbare pagina in gewone woorden: wat we bewaren, waar, hoe beveiligd, en wat jij zelf kunt.
 * De opslagplaats komt uit DATA_REGIO (bijvoorbeeld "de EU (Frankfurt)"); zolang die leeg is, noemen we geen plek.
 */
export default function Gegevens() {
  const regio = process.env.DATA_REGIO?.trim();
  const blok = (titel: string, tekst: React.ReactNode) => (
    <section className="border-t border-lijn pt-5">
      <h2 className="text-[16px] font-semibold">{titel}</h2>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-tekst-2">{tekst}</div>
    </section>
  );
  return (
    <main className="flex flex-1 flex-col items-center px-5 py-12">
      <Link href="/login"><Woordmerk /></Link>
      <article className="kaart mt-6 w-full max-w-2xl space-y-5 p-6 md:p-8">
        <h1 className="text-[24px] font-semibold">Zo bewaren we je gegevens</h1>
        <p className="text-sm text-tekst-2">Je boekhouding is van jou. Hieronder staat in gewone woorden wat {MERK} bewaart en hoe.</p>
        {blok("Wat we bewaren", <p>Je betalingen, bonnen, facturen, klanten, uren, kilometers en bedrijfsgegevens. Alleen wat nodig is voor je boekhouding en belasting.</p>)}
        {blok("Waar", <p>{regio ? `Je gegevens staan op servers in ${regio}.` : "Je gegevens staan bij onze hostingpartijen (database en website), met een verwerkersovereenkomst."} Kopieën van bonnen en facturen staan bij dezelfde partij.</p>)}
        {blok("Hoe beveiligd", <>
          <p>Alles gaat versleuteld over het internet (https). De toegang tot je bank en andere koppelingen bewaren we extra versleuteld.</p>
          <p>De bankkoppeling kan alleen meekijken: niemand kan via {MERK} geld overmaken, ook wij niet.</p>
          <p>Inloggen gaat met een code per e-mail, of met Face ID of je vingerafdruk. Wil je extra zekerheid, zet dan tweestapsverificatie aan bij Instellingen.</p>
        </>)}
        {blok("AI", <p>{MERK} gebruikt AI om je betalingen te boeken en bonnen te lezen. Je gegevens worden nooit gebruikt om AI-modellen te trainen.</p>)}
        {blok("Wie erbij kan", <p>Alleen jij en de mensen die jij uitnodigt (bijvoorbeeld je boekhouder, eventueel alleen-lezen). Wat er verandert, staat in het logboek.</p>)}
        {blok("Wat jij zelf kunt", <>
          <p>Alles downloaden met één knop (Excel, en het auditbestand voor de Belastingdienst) onder Meer &gt; Downloaden.</p>
          <p>Je onderneming en al je gegevens verwijderen bij Instellingen &gt; Verwijderen. De wet vraagt ondernemers hun administratie 7 jaar te bewaren; download daarom eerst alles.</p>
        </>)}
        <p className="border-t border-lijn pt-5 text-[13px] text-tekst-3">Vragen? Mail ons. Werkt er iets niet? Kijk op de <Link href="/status" className="underline">statuspagina</Link>.</p>
      </article>
    </main>
  );
}
