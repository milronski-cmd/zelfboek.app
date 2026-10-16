import { useState } from "react";
import { Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import { api, bestandVeld } from "@/lib/api";
import { useBonnen, useVervers } from "@/lib/queries";
import { euro, datumKort } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import type { Bon } from "@/lib/types";
import { Chips, Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tekst, useKleuren } from "@/components/ui";

const FILTERS = [{ k: "", l: "Alles" }, { k: "uitgelezen", l: "Zonder betaling" }, { k: "gekoppeld", l: "Gekoppeld" }, { k: "fout", l: "Niet leesbaar" }, { k: "nieuw", l: "Nog lezen" }];
export const bonStatus = (b: Bon): { kleur: "groen" | "geel" | "rood" | "grijs"; tekst: string } =>
  b.status === "gekoppeld" ? { kleur: "groen", tekst: "Gekoppeld" } : b.status === "uitgelezen" ? { kleur: "geel", tekst: "Zonder betaling" } : b.status === "fout" ? { kleur: "rood", tekst: "Niet leesbaar" } : { kleur: "grijs", tekst: "Nog lezen" };

/** Bonnen: foto maken of kiezen, Saldoplan leest hem uit en hangt hem aan de betaling. */
export default function Bonnen() {
  const k = useKleuren();
  const sp = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState(sp.status ?? "");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "fout" | "ok"; tekst: string } | null>(null);
  const { data, isLoading, refetch } = useBonnen();
  const ververs = useVervers();

  const upload = async (bestanden: { uri: string; naam: string; type: string }[]) => {
    if (bestanden.length === 0) return;
    setBezig(true); setMelding(null);
    let ok = 0; const fouten: string[] = [];
    for (const b of bestanden) {
      const fd = new FormData();
      fd.append("bestand", bestandVeld(b.uri, b.naam, b.type));
      try {
        const r = await api<{ bon: Bon; gekoppeld: boolean; melding: string }>("/api/mobiel/bonnen", { form: fd });
        ok++;
        if (bestanden.length === 1) setMelding({ soort: "ok", tekst: r.melding });
      } catch (e) { fouten.push(e instanceof Error ? e.message : "Upload mislukt"); }
    }
    if (bestanden.length > 1 || fouten.length) setMelding(fouten.length ? { soort: "fout", tekst: `${ok} gelukt, ${fouten.length} niet: ${fouten[0]}` } : { soort: "ok", tekst: `${ok} bonnen ingelezen.` });
    await ververs("bonnen", "overzicht", "transacties");
    setBezig(false);
  };
  const camera = async () => {
    const toestemming = await ImagePicker.requestCameraPermissionsAsync();
    if (!toestemming.granted) { setMelding({ soort: "fout", tekst: "Geef Saldoplan toegang tot de camera in Instellingen." }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!r.canceled) await upload(r.assets.map((a, i) => ({ uri: a.uri, naam: a.fileName ?? `bon-${Date.now()}-${i}.jpg`, type: a.mimeType ?? "image/jpeg" })));
  };
  const fotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 10 });
    if (!r.canceled) await upload(r.assets.map((a, i) => ({ uri: a.uri, naam: a.fileName ?? `bon-${Date.now()}-${i}.jpg`, type: a.mimeType ?? "image/jpeg" })));
  };
  const pdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) await upload(r.assets.map((a) => ({ uri: a.uri, naam: a.name, type: a.mimeType ?? "application/pdf" })));
  };

  const bonnen = (data?.bonnen ?? []).filter((b) => !filter || b.status === filter);
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Bonnen" sub="Maak een foto of kies een PDF. Saldoplan leest het bedrag en hangt de bon aan de betaling." />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Knop tekst="Foto maken" style={{ flex: 1 }} bezig={bezig} onPress={camera} />
        <Knop tekst="Uit foto's" soort="licht" style={{ flex: 1 }} disabled={bezig} onPress={fotos} />
        <Knop tekst="PDF" soort="licht" disabled={bezig} onPress={pdf} />
      </View>
      {bezig && <Melding soort="info" tekst="Saldoplan leest de bon uit. Dit duurt een paar seconden." />}
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Chips opties={FILTERS} waarde={filter} onChange={setFilter} />
      {isLoading ? <Laden /> : bonnen.length === 0 ? (
        <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>{filter ? "Geen bonnen met deze status." : "Nog geen bonnen. Maak een foto van je eerste bon, of stuur bonnen door per e-mail (adres onder Koppelingen)."}</Tekst></Kaart>
      ) : (
        <Kaart strak>
          {bonnen.map((b, i) => {
            const s = bonStatus(b);
            return <Rij key={b.id} titel={b.leverancier || b.bestandsnaam} sub={b.uitleg ?? (b.datum ? datumKort(b.datum) : null)} rechts={b.totaal != null ? euro(b.totaal) : ""} rechtsSub={b.datum ? datumKort(b.datum) : undefined} links={<Pil kleur={s.kleur}>{s.tekst}</Pil>} onPress={() => ga("/bon/[id]", { id: b.id })} laatste={i === bonnen.length - 1} />;
          })}
        </Kaart>
      )}
      <Text style={{ color: k.tekst3, fontSize: 12, textAlign: "center" }}>Tot 20 MB per bon: JPG, PNG, WebP of PDF.</Text>
    </Scherm>
  );
}
