import { useState } from "react";
import { actie } from "@/lib/api";
import { useInstellingen } from "@/lib/instellingen";
import { useVervers } from "@/lib/queries";
import { Kies } from "@/components/kies";
import { Chips, Kaart, Knop, Laden, Melding, Scherm, Schakel, Tekst } from "@/components/ui";

type Vorm = { btwTijdvak: string; btwStelsel: string; korDeelnemer: boolean; urencriterium: boolean; starter: boolean; zekerheidsgrens: string };

/** Belastinginstellingen: btw-tijdvak, kas- of factuurstelsel, KOR, urencriterium, startersaftrek en hoe vaak Saldoplan het mag vragen. */
export default function Belasting() {
  const { data, refetch } = useInstellingen();
  const ververs = useVervers();
  const [vorm, setVorm] = useState<Vorm | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (data && !vorm) setVorm({ btwTijdvak: data.fiscaal.btwTijdvak, btwStelsel: data.fiscaal.btwStelsel, korDeelnemer: data.fiscaal.korDeelnemer, urencriterium: data.fiscaal.urencriterium, starter: data.fiscaal.starter, zekerheidsgrens: String(data.fiscaal.zekerheidsgrens) });
  if (!vorm) return <Scherm><Laden /></Scherm>;
  const zet = (deel: Partial<Vorm>) => setVorm({ ...vorm, ...deel });
  const opslaan = async () => {
    setBezig(true); setMelding(null);
    try { const r = await actie("fiscaalOpslaan", { btwTijdvak: vorm.btwTijdvak, btwStelsel: vorm.btwStelsel, korDeelnemer: vorm.korDeelnemer, urencriterium: vorm.urencriterium, starter: vorm.starter, zekerheidsgrens: vorm.zekerheidsgrens }); setMelding(r.ok ? { soort: "ok", tekst: "Belastinginstellingen opgeslagen." } : { soort: "fout", tekst: r.fout }); await Promise.all([refetch(), ververs("btw", "ib", "overzicht")]); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Opslaan lukte niet." }); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Btw">
        <Kies label="Btw-aangifte" waarde={vorm.btwTijdvak} opties={[{ k: "maand", l: "Elke maand" }, { k: "kwartaal", l: "Elk kwartaal" }, { k: "jaar", l: "Elk jaar" }]} onChange={(v) => zet({ btwTijdvak: v })} hint="Staat in de brief van de Belastingdienst. De meeste zzp'ers doen aangifte per kwartaal." />
        <Kies label="Wanneer telt de btw van een factuur?" waarde={vorm.btwStelsel} opties={[{ k: "factuur", l: "Als ik de factuur stuur (standaard)" }, { k: "kas", l: "Als het geld binnen is (kasstelsel)" }]} onChange={(v) => zet({ btwStelsel: v })} hint="Het kasstelsel mag alleen als de Belastingdienst het goedkeurde." />
        <Schakel label="Ik doe mee aan de kleineondernemersregeling (KOR)" uitleg="Dan reken je geen btw en doe je geen btw-aangifte. Kan alleen onder 20.000 euro omzet per jaar." aan={vorm.korDeelnemer} onChange={(v) => zet({ korDeelnemer: v })} />
      </Kaart>
      <Kaart titel="Inkomstenbelasting">
        <Schakel label="Ik haal het urencriterium van 1.225 uur" uitleg="Nodig voor de zelfstandigenaftrek en de startersaftrek." aan={vorm.urencriterium} onChange={(v) => zet({ urencriterium: v })} />
        <Schakel label="Ik gebruik dit jaar de startersaftrek" uitleg="Kan drie keer in de eerste vijf jaar van je onderneming." aan={vorm.starter} onChange={(v) => zet({ starter: v })} />
      </Kaart>
      <Kaart titel="Hoe vaak mag Saldoplan het je vragen?">
        <Tekst kleur="2" soort="klein">Twijfelt Saldoplan over een betaling, dan vraagt het: zakelijk of privé? Kies hoe voorzichtig dat moet.</Tekst>
        <Chips opties={[{ k: "0.95", l: "Voorzichtig" }, { k: "0.85", l: "Normaal" }, { k: "0.7", l: "Snel" }]} waarde={vorm.zekerheidsgrens} onChange={(v) => zet({ zekerheidsgrens: v })} />
      </Kaart>
      <Knop tekst="Opslaan" bezig={bezig} onPress={opslaan} />
    </Scherm>
  );
}
