import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { api, downloadNaarCache } from "@/lib/api";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Laden, Melding, Rij, Scherm, Tekst } from "@/components/ui";

type Item = { titel: string; tekst: string; pad: string; bestand: string; knop: string };
type Antwoord = { jaar: number; groepen: { kop: string; items: Item[] }[] };

/** Downloaden: je gegevens zijn van jou, in open formaten. PDF's open je in de app, de rest deel je of bewaar je in Bestanden. */
export default function Exports() {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({ queryKey: ["exports", jaar], queryFn: () => api<Antwoord>(`/api/mobiel/exports?jaar=${jaar}`) });
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const haal = async (it: Item) => {
    if (it.bestand.endsWith(".pdf")) { ga("/pdf", { pad: it.pad, naam: it.bestand, titel: it.titel }); return; }
    setBezig(it.pad); setFout(null);
    try { const uri = await downloadNaarCache(it.pad, it.bestand); await Sharing.shareAsync(uri, { dialogTitle: it.titel }); }
    catch (e) { setFout(e instanceof Error ? e.message : "Downloaden lukte niet."); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Downloaden" sub={`Boekjaar ${jaar}. Je gegevens zijn van jou en altijd te downloaden in open formaten.`}>
        <Knop tekst={String(jaar - 1)} soort="licht" klein onPress={() => setJaar(jaar - 1)} />
        <Knop tekst={String(jaar + 1)} soort="licht" klein onPress={() => setJaar(jaar + 1)} />
      </Kop>
      {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
      {data.groepen.map((g) => (
        <Kaart key={g.kop} titel={g.kop} strak>
          {g.items.map((it, i) => <Rij key={it.pad} titel={it.titel} sub={it.tekst} rechts={<Knop tekst={bezig === it.pad ? "…" : it.knop} klein soort="licht" bezig={bezig === it.pad} onPress={() => haal(it)} />} laatste={i === g.items.length - 1} />)}
        </Kaart>
      ))}
      <Tekst kleur="3" soort="klein" style={{ textAlign: "center" }}>Bestanden anders dan PDF gaan via het deelmenu naar Bestanden, Mail of je boekhouder.</Tekst>
    </Scherm>
  );
}
