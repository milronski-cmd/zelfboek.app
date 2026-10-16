import { useState } from "react";
import { Alert, View } from "react-native";
import { actie } from "@/lib/api";
import { useProducten, useVervers } from "@/lib/queries";
import { euro } from "@/lib/format";
import type { Product } from "@/lib/types";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Kop, Laden, Melding, Rij, Scherm, Tekst, Veld } from "@/components/ui";

const LEEG = { id: "", naam: "", omschrijving: "", prijs: "", btw: "21", eenheid: "stuk" };

/** Producten en diensten: vaste regels voor op je facturen. */
export default function Producten() {
  const { data, isLoading, refetch } = useProducten();
  const ververs = useVervers();
  const [vorm, setVorm] = useState<typeof LEEG | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const opslaan = async () => {
    if (!vorm?.naam.trim()) return;
    setBezig(true); setFout(null);
    try { const r = await actie("productOpslaan", vorm); if (!r.ok) setFout(r.fout); else { setVorm(null); await ververs("producten"); } }
    catch (e) { setFout(e instanceof Error ? e.message : "Opslaan lukte niet."); }
    finally { setBezig(false); }
  };
  const verwijder = (p: Product) => Alert.alert("Verwijderen", `${p.naam} wordt verwijderd.`, [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: async () => { await actie("productVerwijderen", { id: p.id }); setVorm(null); await ververs("producten"); } }]);
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Producten" sub="Kies ze met één tik als regel op een factuur of offerte.">
        {!vorm && <Knop tekst="Nieuw product" klein onPress={() => setVorm(LEEG)} />}
      </Kop>
      {vorm && (
        <Kaart titel={vorm.id ? "Product bewerken" : "Nieuw product"}>
          <Veld label="Naam" value={vorm.naam} onChangeText={(v) => setVorm({ ...vorm, naam: v })} autoFocus />
          <Veld label="Omschrijving (mag leeg)" value={vorm.omschrijving} onChangeText={(v) => setVorm({ ...vorm, omschrijving: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Prijs excl. btw" value={vorm.prijs} onChangeText={(v) => setVorm({ ...vorm, prijs: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Kies label="Btw" waarde={vorm.btw} opties={[{ k: "21", l: "21%" }, { k: "9", l: "9%" }, { k: "0", l: "0%" }]} onChange={(v) => setVorm({ ...vorm, btw: v })} /></View>
            <View style={{ flex: 1 }}><Kies label="Per" waarde={vorm.eenheid} opties={["stuk", "uur", "dag", "maand", "km"].map((e) => ({ k: e, l: e }))} onChange={(v) => setVorm({ ...vorm, eenheid: v })} /></View>
          </View>
          {fout && <Melding tekst={fout} />}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setVorm(null)} />
            <Knop tekst="Opslaan" style={{ flex: 1 }} bezig={bezig} onPress={opslaan} />
          </View>
        </Kaart>
      )}
      {isLoading ? <Laden /> : !data || data.producten.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Nog geen producten.</Tekst></Kaart> : (
        <Kaart strak>
          {data.producten.map((p, i) => <Rij key={p.id} titel={p.naam} sub={p.omschrijving} rechts={euro(p.prijs)} rechtsSub={`per ${p.eenheid} · ${p.btw}%`} onPress={() => setVorm({ id: p.id, naam: p.naam, omschrijving: p.omschrijving ?? "", prijs: String(p.prijs).replace(".", ","), btw: String(p.btw), eenheid: p.eenheid })} laatste={i === data.producten.length - 1} />)}
        </Kaart>
      )}
      {data && data.producten.length > 0 && vorm?.id ? <Knop tekst="Dit product verwijderen" soort="tekst" onPress={() => verwijder(data.producten.find((p) => p.id === vorm.id)!)} /> : null}
    </Scherm>
  );
}
