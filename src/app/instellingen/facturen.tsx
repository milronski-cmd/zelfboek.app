import { useState } from "react";
import { View } from "react-native";
import { actie } from "@/lib/api";
import { useInstellingen } from "@/lib/instellingen";
import { Kaart, Knop, Laden, Melding, Scherm, Schakel, Tekst, Veld } from "@/components/ui";

type Vorm = { factuurPrefix: string; factuurVolgnr: string; offertePrefix: string; betaaltermijn: string; herinneringAuto: boolean; herinneringTekst1: string; herinneringTekst2: string; herinneringTekst3: string };

/** Nummering, betaaltermijn en herinneringen. */
export default function FacturenInstellingen() {
  const { data, refetch } = useInstellingen();
  const [vorm, setVorm] = useState<Vorm | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (data && !vorm) {
    const f = data.facturen;
    setVorm({ factuurPrefix: f.factuurPrefix, factuurVolgnr: String(f.factuurVolgnr), offertePrefix: f.offertePrefix, betaaltermijn: String(f.betaaltermijn), herinneringAuto: f.herinneringAuto, herinneringTekst1: f.herinneringTekst1 ?? "", herinneringTekst2: f.herinneringTekst2 ?? "", herinneringTekst3: f.herinneringTekst3 ?? "" });
  }
  if (!vorm) return <Scherm><Laden /></Scherm>;
  const zet = (deel: Partial<Vorm>) => setVorm({ ...vorm, ...deel });
  const opslaan = async () => {
    setBezig(true); setMelding(null);
    try { const r = await actie("facturenOpslaan", { ...vorm, herinneringAuto: vorm.herinneringAuto }); setMelding(r.ok ? { soort: "ok", tekst: r.melding } : { soort: "fout", tekst: r.fout }); await refetch(); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Opslaan lukte niet." }); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Nummering">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Factuurprefix" value={vorm.factuurPrefix} onChangeText={(v) => zet({ factuurPrefix: v })} hint="F- geeft F-2026-0001" autoCapitalize="characters" /></View>
          <View style={{ flex: 1 }}><Veld label="Laatste nummer" value={vorm.factuurVolgnr} onChangeText={(v) => zet({ factuurVolgnr: v })} keyboardType="number-pad" hint="Alleen verhogen" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Offerteprefix" value={vorm.offertePrefix} onChangeText={(v) => zet({ offertePrefix: v })} autoCapitalize="characters" /></View>
          <View style={{ flex: 1 }}><Veld label="Betaaltermijn (dagen)" value={vorm.betaaltermijn} onChangeText={(v) => zet({ betaaltermijn: v })} keyboardType="number-pad" /></View>
        </View>
        <Tekst kleur="3" soort="klein">Logo, kleuren en lay-out stel je in onder Huisstijl.</Tekst>
      </Kaart>
      <Kaart titel="Herinneringen">
        <Schakel label="Automatisch versturen" uitleg="Na 7, 21 en 35 dagen over de vervaldatum, met wettelijke rente en kosten bij de laatste." aan={vorm.herinneringAuto} onChange={(v) => zet({ herinneringAuto: v })} />
        <Tekst kleur="2" soort="klein">Eigen tekst (mag leeg): gebruik {"{nummer}"}, {"{bedrag}"}, {"{datum}"}, {"{iban}"}, {"{dagen}"} en bij de laatste {"{kosten}"}, {"{rente}"}, {"{totaal}"}.</Tekst>
        <Veld label="Eerste herinnering (na 7 dagen)" value={vorm.herinneringTekst1} onChangeText={(v) => zet({ herinneringTekst1: v })} multiline />
        <Veld label="Tweede herinnering (na 21 dagen)" value={vorm.herinneringTekst2} onChangeText={(v) => zet({ herinneringTekst2: v })} multiline />
        <Veld label="Laatste herinnering (na 35 dagen)" value={vorm.herinneringTekst3} onChangeText={(v) => zet({ herinneringTekst3: v })} multiline />
      </Kaart>
      <Knop tekst="Opslaan" bezig={bezig} onPress={opslaan} />
    </Scherm>
  );
}
