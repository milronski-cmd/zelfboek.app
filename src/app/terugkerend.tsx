import { useState } from "react";
import { Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumKort } from "@/lib/format";
import { FactuurFormulier } from "@/components/factuur-formulier";
import { Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tekst } from "@/components/ui";

type T = { id: string; klantId: string; klant: string; omschrijving: string; interval: string; volgendeOp: string; eindigtOp: string | null; autoVerzenden: boolean; actief: boolean; aantal: number; totaal: number };
const INTERVAL: Record<string, string> = { week: "elke week", maand: "elke maand", kwartaal: "elk kwartaal", jaar: "elk jaar" };

/** Vaste facturen: abonnementen en vaste maandbedragen; Saldoplan maakt en verstuurt ze op de afgesproken dag. */
export default function Terugkerend() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["terugkerend"], queryFn: () => api<{ lijst: T[] }>("/api/mobiel/terugkerend") });
  const ververs = useVervers();
  const [nieuw, setNieuw] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const doe = async (naam: string, velden: Record<string, string>) => { const r = await actie(naam, velden); setMelding(r.ok ? r.melding || "Opgeslagen." : r.fout); await Promise.all([refetch(), ververs("facturen")]); };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Vaste facturen" sub="Abonnementen en vaste maandbedragen. Saldoplan maakt en verstuurt ze op de afgesproken dag.">
        {!nieuw && <Knop tekst="Nieuwe vaste factuur" klein onPress={() => setNieuw(true)} />}
      </Kop>
      {melding && <Melding soort="ok" tekst={melding} onSluit={() => setMelding(null)} />}
      {nieuw && <FactuurFormulier soort="terugkerend" onKlaar={(r) => { setNieuw(false); setMelding(r.melding); void refetch(); }} />}
      {nieuw && <Knop tekst="Annuleren" soort="tekst" onPress={() => setNieuw(false)} />}
      {data.lijst.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Nog geen vaste facturen.</Tekst></Kaart> : (
        <Kaart strak>
          {data.lijst.map((t, i) => (
            <Rij key={t.id} titel={`${t.klant} · ${t.omschrijving}`} sub={`${INTERVAL[t.interval] ?? t.interval} · volgende ${datumKort(t.volgendeOp)}${t.autoVerzenden ? " · verstuurt zelf" : " · als concept"} · ${t.aantal}× gemaakt`} rechts={euro(t.totaal)} links={<Pil kleur={t.actief ? "groen" : "grijs"}>{t.actief ? "actief" : "gepauzeerd"}</Pil>}
              onPress={() => Alert.alert(t.omschrijving, `${t.klant}, ${INTERVAL[t.interval] ?? t.interval}`, [
                { text: t.actief ? "Pauzeren" : "Hervatten", onPress: () => doe("terugkerendStoppen", { id: t.id, actief: t.actief ? "nee" : "ja" }) },
                { text: "Volgende overslaan", onPress: () => doe("terugkerendOverslaan", { id: t.id }) },
                { text: "Sluiten", style: "cancel" },
              ])} laatste={i === data.lijst.length - 1} />
          ))}
        </Kaart>
      )}
    </Scherm>
  );
}
