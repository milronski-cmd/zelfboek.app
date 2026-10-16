import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { api, actie, bestandVeld } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumKort, getal, isoDatum } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kies } from "@/components/kies";
import { Chips, Cijferband, Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tegel, Tekst, Veld, useKleuren } from "@/components/ui";

type Uren = {
  jaar: number; regels: { id: string; datum: string; uren: number; omschrijving: string; soort: string; uurtarief: number | null; gefactureerd: boolean; klantId: string | null; klant: string | null }[];
  klanten: { id: string; naam: string }[]; totaal: number; declarabel: number; dezeWeek: number; criterium: number; pct: number; verwacht: number;
  openPerKlant: { klantId: string; naam: string; uren: number; bedrag: number }[];
};

/** Uren: voortgang op het urencriterium (1.225), uren schrijven en open uren per klant factureren. */
export default function UrenScherm() {
  const k = useKleuren();
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({ queryKey: ["uren", jaar], queryFn: () => api<Uren>(`/api/mobiel/uren?jaar=${jaar}`) });
  const ververs = useVervers();
  const [vorm, setVorm] = useState({ datum: isoDatum(), uren: "", omschrijving: "", soort: "declarabel", klantId: "", uurtarief: "" });
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const na = async () => { await Promise.all([refetch(), ververs("uren", "overzicht", "ib")]); };
  const toevoegen = async () => {
    setBezig("toevoegen"); setMelding(null);
    try { const r = await actie("urenToevoegen", vorm); if (!r.ok) setMelding({ soort: "fout", tekst: r.fout }); else { setVorm({ ...vorm, uren: "", omschrijving: "" }); setOpen(false); await na(); } }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  const agenda = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["text/calendar", "*/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    setBezig("agenda");
    try {
      const fd = new FormData(); fd.append("naam", "urenUitAgenda"); fd.append("bestand", bestandVeld(r.assets[0].uri, r.assets[0].name, "text/calendar")); fd.append("overnemen", "1");
      const uit = await api<{ ok: boolean; melding?: string; fout?: string }>("/api/mobiel/actie", { form: fd });
      setMelding(uit.ok ? { soort: "ok", tekst: uit.melding ?? "Uren overgenomen." } : { soort: "fout", tekst: uit.fout ?? "Inlezen lukte niet." });
      await na();
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Inlezen lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel={`Uren ${jaar}`} sub="Voor de zelfstandigenaftrek heb je 1.225 uur per jaar nodig. Saldoplan telt mee.">
        <Knop tekst={String(jaar - 1)} soort="licht" klein onPress={() => setJaar(jaar - 1)} />
        <Knop tekst={String(jaar + 1)} soort="licht" klein onPress={() => setJaar(jaar + 1)} />
        <Knop tekst="Uit je agenda (.ics)" soort="licht" klein bezig={bezig === "agenda"} onPress={agenda} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Cijferband>
        <Tegel label="Dit jaar" waarde={`${getal(data.totaal)} uur`} hint={`${data.pct}% van ${data.criterium.toLocaleString("nl-NL")}; verwacht ${data.verwacht}`} accent={data.pct >= 100 ? "groen" : undefined} />
        <Tegel label="Declarabel" waarde={`${getal(data.declarabel)} uur`} hint={`Deze week ${getal(data.dezeWeek)} uur`} />
      </Cijferband>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: k.lijn, overflow: "hidden" }}><View style={{ width: `${data.pct}%`, height: 8, backgroundColor: data.pct >= 100 ? k.groen : k.primair }} /></View>

      {open ? (
        <Kaart titel="Uren schrijven">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Datum" value={vorm.datum} onChangeText={(v) => setVorm({ ...vorm, datum: v })} /></View>
            <View style={{ flex: 1 }}><Veld label="Uren" value={vorm.uren} onChangeText={(v) => setVorm({ ...vorm, uren: v })} keyboardType="decimal-pad" placeholder="2,5" autoFocus /></View>
          </View>
          <Veld label="Wat heb je gedaan" value={vorm.omschrijving} onChangeText={(v) => setVorm({ ...vorm, omschrijving: v })} />
          <Chips label="Soort" opties={[{ k: "declarabel", l: "Voor een klant" }, { k: "indirect", l: "Eigen bedrijf" }]} waarde={vorm.soort} onChange={(v) => setVorm({ ...vorm, soort: v })} />
          {vorm.soort === "declarabel" && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 2 }}><Kies label="Klant" waarde={vorm.klantId || null} opties={data.klanten.map((c) => ({ k: c.id, l: c.naam }))} onChange={(v) => setVorm({ ...vorm, klantId: v })} placeholder="Geen klant" /></View>
              <View style={{ flex: 1 }}><Veld label="Tarief" value={vorm.uurtarief} onChangeText={(v) => setVorm({ ...vorm, uurtarief: v })} keyboardType="decimal-pad" placeholder="95" /></View>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Knop tekst="Toevoegen" style={{ flex: 1 }} bezig={bezig === "toevoegen"} disabled={!vorm.uren} onPress={toevoegen} />
          </View>
        </Kaart>
      ) : <Knop tekst="Uren schrijven" onPress={() => setOpen(true)} />}

      {data.openPerKlant.length > 0 && (
        <Kaart titel="Nog te factureren" strak>
          {data.openPerKlant.map((p, i) => <Rij key={p.klantId} titel={p.naam} sub={`${getal(p.uren)} uur`} rechts={p.bedrag ? euro(p.bedrag) : "tarief?"} onPress={() => ga("/klant/[id]", { id: p.klantId })} laatste={i === data.openPerKlant.length - 1} />)}
        </Kaart>
      )}
      <Kaart titel={`Geschreven uren (${data.regels.length})`} strak>
        {data.regels.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12 }}>Nog geen uren in {jaar}.</Tekst>}
        {data.regels.map((r, i) => (
          <Rij key={r.id} titel={r.omschrijving} sub={[datumKort(r.datum), r.klant, r.soort === "indirect" ? "eigen bedrijf" : null].filter(Boolean).join(" · ")} rechts={`${getal(r.uren)} u`} links={r.gefactureerd ? <Pil kleur="groen">gefactureerd</Pil> : undefined}
            onPress={() => Alert.alert(r.omschrijving, `${getal(r.uren)} uur op ${datumKort(r.datum)}`, [{ text: "Sluiten", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: async () => { await actie("urenVerwijderen", { id: r.id }); await na(); } }])} laatste={i === data.regels.length - 1} />
        ))}
      </Kaart>
      <Text style={{ color: k.tekst3, fontSize: 12 }}>Urencriterium: alle uren voor je bedrijf tellen, ook administratie, acquisitie en reistijd.</Text>
    </Scherm>
  );
}
