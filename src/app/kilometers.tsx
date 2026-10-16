import { useState } from "react";
import { Alert, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumKort, getal, isoDatum } from "@/lib/format";
import { Chips, Cijferband, Kaart, Knop, Kop, Laden, Melding, Rij, Scherm, Schakel, Tegel, Tekst, Veld } from "@/components/ui";

type Km = { jaar: number; vergoedingPerKm: number; regels: { id: string; datum: string; van: string; naar: string; km: number; retour: boolean; doel: string; vervoer: string; vergoeding: number }[]; totaalKm: number; totaalVergoeding: number };
const VERVOER = [{ k: "prive_auto", l: "Eigen auto" }, { k: "fiets", l: "Fiets" }, { k: "ov", l: "OV" }, { k: "zakelijke_auto", l: "Auto van de zaak" }];

/** Kilometers: zakelijke ritten met je eigen auto of fiets, € 0,23 per kilometer aftrekbaar. */
export default function Kilometers() {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({ queryKey: ["kilometers", jaar], queryFn: () => api<Km>(`/api/mobiel/kilometers?jaar=${jaar}`) });
  const ververs = useVervers();
  const [open, setOpen] = useState(false);
  const [vorm, setVorm] = useState({ datum: isoDatum(), van: "", naar: "", km: "", retour: true, doel: "", vervoer: "prive_auto" });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const na = async () => { await Promise.all([refetch(), ververs("kilometers", "ib")]); };
  const toevoegen = async () => {
    setBezig(true); setFout(null);
    try { const r = await actie("kilometersToevoegen", { ...vorm, retour: vorm.retour ? "ja" : "nee" }); if (!r.ok) setFout(r.fout); else { setVorm({ ...vorm, km: "", doel: "" }); setOpen(false); await na(); } }
    catch (e) { setFout(e instanceof Error ? e.message : "Dat lukte niet."); }
    finally { setBezig(false); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel={`Kilometers ${jaar}`} sub={`Elke zakelijke kilometer met je eigen auto of fiets levert € ${data.vergoedingPerKm.toFixed(2).replace(".", ",")} aftrek op.`}>
        <Knop tekst={String(jaar - 1)} soort="licht" klein onPress={() => setJaar(jaar - 1)} />
        <Knop tekst={String(jaar + 1)} soort="licht" klein onPress={() => setJaar(jaar + 1)} />
      </Kop>
      <Cijferband>
        <Tegel label="Gereden" waarde={`${getal(data.totaalKm, 0)} km`} hint={`${data.regels.length} ritten`} />
        <Tegel label="Aftrek" waarde={euro(data.totaalVergoeding)} hint="telt mee voor je winst" accent="groen" />
      </Cijferband>
      {open ? (
        <Kaart titel="Rit toevoegen">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Datum" value={vorm.datum} onChangeText={(v) => setVorm({ ...vorm, datum: v })} /></View>
            <View style={{ flex: 1 }}><Veld label="Kilometers (enkele reis)" value={vorm.km} onChangeText={(v) => setVorm({ ...vorm, km: v })} keyboardType="decimal-pad" autoFocus /></View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Van" value={vorm.van} onChangeText={(v) => setVorm({ ...vorm, van: v })} placeholder="Kantoor" /></View>
            <View style={{ flex: 1 }}><Veld label="Naar" value={vorm.naar} onChangeText={(v) => setVorm({ ...vorm, naar: v })} placeholder="Klant in Utrecht" /></View>
          </View>
          <Veld label="Doel" value={vorm.doel} onChangeText={(v) => setVorm({ ...vorm, doel: v })} placeholder="Bespreking offerte" />
          <Chips label="Vervoer" opties={VERVOER} waarde={vorm.vervoer} onChange={(v) => setVorm({ ...vorm, vervoer: v })} />
          <Schakel label="Retour" uitleg="Heen en terug telt dubbel." aan={vorm.retour} onChange={(v) => setVorm({ ...vorm, retour: v })} />
          {fout && <Melding tekst={fout} />}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Knop tekst="Toevoegen" style={{ flex: 1 }} bezig={bezig} disabled={!vorm.km} onPress={toevoegen} />
          </View>
        </Kaart>
      ) : <Knop tekst="Rit toevoegen" onPress={() => setOpen(true)} />}
      <Kaart titel="Ritten" strak>
        {data.regels.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12 }}>Nog geen ritten in {jaar}.</Tekst>}
        {data.regels.map((r, i) => (
          <Rij key={r.id} titel={`${r.van} → ${r.naar}`} sub={`${datumKort(r.datum)} · ${r.doel}${r.retour ? " · retour" : ""} · ${VERVOER.find((v) => v.k === r.vervoer)?.l ?? r.vervoer}`} rechts={`${getal(r.km, 0)} km`} rechtsSub={r.vergoeding ? euro(r.vergoeding) : undefined}
            onPress={() => Alert.alert(`${r.van} → ${r.naar}`, `${getal(r.km, 0)} km op ${datumKort(r.datum)}`, [{ text: "Sluiten", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: async () => { await actie("kilometersVerwijderen", { id: r.id }); await na(); } }])} laatste={i === data.regels.length - 1} />
        ))}
      </Kaart>
    </Scherm>
  );
}
