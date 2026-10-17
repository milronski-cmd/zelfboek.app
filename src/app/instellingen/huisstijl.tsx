import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, BASIS, bestandVeld, koppen } from "@/lib/api";
import { useInstellingen } from "@/lib/instellingen";
import { useMeta, useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Laden, Melding, Scherm, Schakel, Tekst, Veld, useKleuren } from "@/components/ui";

const KLEUREN = ["#1c1917", "#0a7ea3", "#1e6b47", "#7c3aed", "#b45309", "#be123c", "#0f766e", "#1d4ed8", "#374151", "#111827"];

/** Huisstijl van facturen en offertes: lay-out, kleuren, lettertype, logo, voettekst. Het voorbeeld is dezelfde PDF als in de webapp. */
export default function Huisstijl() {
  const k = useKleuren();
  const { data, refetch } = useInstellingen();
  const meta = useMeta();
  const ververs = useVervers();
  const [vorm, setVorm] = useState<{ layout: string; kleur: string; kleur2: string; letter: string; voettekst: string; logoWeg: boolean } | null>(null);
  const [logo, setLogo] = useState<{ uri: string; naam: string; type: string } | null>(null);
  const [versie, setVersie] = useState(0);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (data && !vorm) setVorm({ layout: data.huisstijl.layout, kleur: data.huisstijl.kleur, kleur2: data.huisstijl.kleur2 ?? "", letter: data.huisstijl.letter, voettekst: data.huisstijl.voettekst ?? "", logoWeg: false });
  if (!vorm || !data) return <Scherm><Laden /></Scherm>;
  const zet = (deel: Partial<typeof vorm>) => setVorm({ ...vorm, ...deel });
  const kiesLogo = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!r.canceled && r.assets[0]) { setLogo({ uri: r.assets[0].uri, naam: r.assets[0].fileName ?? "logo.png", type: r.assets[0].mimeType ?? "image/png" }); zet({ logoWeg: false }); }
  };
  const velden = () => {
    const fd = new FormData();
    fd.append("factuurLayout", vorm.layout); fd.append("huisstijlKleur", vorm.kleur); fd.append("huisstijlKleur2", vorm.kleur2); fd.append("huisstijlLetter", vorm.letter); fd.append("factuurVoettekst", vorm.voettekst);
    if (logo) fd.append("logo", bestandVeld(logo.uri, logo.naam, logo.type));
    if (vorm.logoWeg) fd.append("logoVerwijderen", "on");
    return fd;
  };
  const opslaan = async () => {
    setBezig(true); setMelding(null);
    try {
      const fd = velden(); fd.append("naam", "huisstijlOpslaan");
      const r = await api<{ ok: boolean; melding?: string; fout?: string }>("/api/mobiel/actie", { form: fd });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding ?? "Huisstijl opgeslagen." } : { soort: "fout", tekst: r.fout ?? "Opslaan lukte niet." });
      if (r.ok) { setLogo(null); setVersie((v) => v + 1); await refetch(); await ververs("instellingen"); }
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Opslaan lukte niet." }); }
    finally { setBezig(false); }
  };
  const voorbeeld = (soort: "factuur" | "offerte") => {
    const q = new URLSearchParams({ factuurLayout: vorm.layout, huisstijlKleur: vorm.kleur, huisstijlKleur2: vorm.kleur2, huisstijlLetter: vorm.letter, factuurVoettekst: vorm.voettekst, soort });
    ga("/pdf", { pad: `/api/huisstijl/voorbeeld?${q}`, naam: `voorbeeld-${soort}.pdf`, titel: `Voorbeeld ${soort}` });
  };
  const toonLogo = !vorm.logoWeg && (logo || data.huisstijl.heeftLogo);
  return (
    <Scherm>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Lay-out">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(meta.data?.layouts ?? []).map((l) => <Knop key={l.k} tekst={l.l} klein soort={vorm.layout === l.k ? "primair" : "licht"} onPress={() => zet({ layout: l.k })} />)}
        </View>
        <Tekst kleur="3" soort="klein">{meta.data?.layouts.find((l) => l.k === vorm.layout)?.uitleg}</Tekst>
      </Kaart>
      <Kaart titel="Kleuren">
        <Tekst kleur="2" soort="klein">Hoofdkleur</Tekst>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {KLEUREN.map((c) => <Pressable key={c} onPress={() => zet({ kleur: c })} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: vorm.kleur === c ? 3 : 0, borderColor: k.primairLicht }} />)}
        </View>
        <Veld label="Of een eigen kleurcode" value={vorm.kleur} onChangeText={(v) => zet({ kleur: v })} autoCapitalize="none" placeholder="#1c1917" />
        <Veld label="Tweede kleur (leeg = hoofdkleur)" value={vorm.kleur2} onChangeText={(v) => zet({ kleur2: v })} autoCapitalize="none" placeholder="#0a7ea3" hint="Tabelkop en lijnen." />
      </Kaart>
      <Kaart titel="Lettertype">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(meta.data?.letters ?? []).map((l) => <Knop key={l.k} tekst={`${l.l} (${l.uitleg.replace(/\.$/, "")})`} klein soort={vorm.letter === l.k ? "primair" : "licht"} onPress={() => zet({ letter: l.k })} />)}
        </View>
      </Kaart>
      <Kaart titel="Logo">
        {toonLogo && <Image source={logo ? { uri: logo.uri } : { uri: `${BASIS}/api/huisstijl/logo?v=${versie}`, headers: koppen() }} style={{ width: 160, height: 70, backgroundColor: "#fff", borderRadius: 6 }} resizeMode="contain" />}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Knop tekst={toonLogo ? "Ander logo" : "Logo kiezen"} klein soort="licht" onPress={kiesLogo} />
          {data.huisstijl.heeftLogo && !logo && <Schakel label="Logo weghalen" aan={vorm.logoWeg} onChange={(v) => zet({ logoWeg: v })} />}
        </View>
        <Text style={{ color: k.tekst3, fontSize: 12 }}>PNG of JPG, tot 2 MB. Zonder logo staat je bedrijfsnaam in de hoofdkleur.</Text>
      </Kaart>
      <Kaart titel="Voettekst">
        <Veld value={vorm.voettekst} onChangeText={(v) => zet({ voettekst: v })} multiline placeholder="Bijvoorbeeld: Op al onze diensten zijn onze algemene voorwaarden van toepassing." />
      </Kaart>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Knop tekst="Voorbeeld factuur" soort="licht" style={{ flex: 1 }} onPress={() => voorbeeld("factuur")} />
        <Knop tekst="Voorbeeld offerte" soort="licht" style={{ flex: 1 }} onPress={() => voorbeeld("offerte")} />
      </View>
      <Knop tekst="Opslaan" bezig={bezig} onPress={opslaan} />
    </Scherm>
  );
}
