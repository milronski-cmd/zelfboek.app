import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, euroHeel, datumKort, isoDatum } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kies } from "@/components/kies";
import { Cijferband, Kaart, Knop, Kop, Laden, Melding, Scherm, Tegel, Tekst, Veld, useKleuren } from "@/components/ui";

type Post = { label: string; rgs: string; bedrag: number };
type Jr = {
  jaar: number; afgesloten: boolean; afgeslotenOp: string | null;
  wv: { omzet: number; kosten: number; kostenAftrekbaar: number; afschrijving: number; winst: number; fiscaleWinst: number; omzetRegels: { label: string; bedrag: number }[]; kostenRegels: { label: string; bedrag: number }[] };
  activa: Post[]; passiva: Post[]; totaalActiva: number; totaalPassiva: number; eigenVermogen: number; kengetallen: { label: string; waarde: string; uitleg: string }[];
  memoriaal: { id: string; datum: string; omschrijving: string; bedrag: number; categorie: string; soort: string }[]; categorieen: { k: string; label: string }[]; pdf: string;
};

/** Jaaroverzicht: winst-en-verlies, balans, kengetallen, correcties en het jaar afsluiten. */
export default function Jaarrekening() {
  const k = useKleuren();
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({ queryKey: ["jaarrekening", jaar], queryFn: () => api<Jr>(`/api/mobiel/jaarrekening?jaar=${jaar}`) });
  const ververs = useVervers();
  const [correctie, setCorrectie] = useState<{ datum: string; omschrijving: string; bedrag: string; categorie: string } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const doe = async (naam: string, velden: Record<string, string | number>, ok: string) => {
    setBezig(naam); setMelding(null);
    try { const r = await actie(naam, velden); setMelding(r.ok ? { soort: "ok", tekst: r.melding || ok } : { soort: "fout", tekst: r.fout }); if (r.ok) setCorrectie(null); await Promise.all([refetch(), ververs("ib", "btw", "overzicht")]); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel={`Jaaroverzicht ${jaar}`} sub={data.afgesloten ? `Afgesloten op ${datumKort(data.afgeslotenOp!)}.` : "Winst-en-verliesrekening, balans en kengetallen, live uit je boekhouding."}>
        <Knop tekst={String(jaar - 1)} soort="licht" klein onPress={() => setJaar(jaar - 1)} />
        <Knop tekst={String(jaar + 1)} soort="licht" klein onPress={() => setJaar(jaar + 1)} />
        <Knop tekst="PDF" soort="licht" klein onPress={() => ga("/pdf", { pad: data.pdf, naam: `jaarrekening-${jaar}.pdf`, titel: `Jaarrekening ${jaar}` })} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Cijferband>
        <Tegel label="Omzet" waarde={euroHeel(data.wv.omzet)} />
        <Tegel label="Kosten" waarde={euroHeel(data.wv.kosten)} hint={`waarvan afschrijving ${euro(data.wv.afschrijving)}`} />
        <Tegel label="Winst" waarde={euroHeel(data.wv.winst)} accent={data.wv.winst >= 0 ? "groen" : "rood"} hint={`fiscaal ${euro(data.wv.fiscaleWinst)}`} />
        <Tegel label="Eigen vermogen" waarde={euroHeel(data.eigenVermogen)} />
      </Cijferband>
      <Kaart titel="Winst-en-verliesrekening">
        <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700" }}>OMZET</Text>
        {data.wv.omzetRegels.map((r) => <Regel key={r.label} l={r.label} r={euro(r.bedrag)} />)}
        <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700", marginTop: 6 }}>KOSTEN</Text>
        {data.wv.kostenRegels.map((r) => <Regel key={r.label} l={r.label} r={euro(r.bedrag)} />)}
        <View style={{ borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 8 }}><Regel l="Resultaat" r={euro(data.wv.winst)} vet /></View>
      </Kaart>
      <Kaart titel="Balans">
        <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700" }}>BEZITTINGEN</Text>
        {data.activa.map((p) => <Regel key={p.rgs + p.label} l={p.label} r={euro(p.bedrag)} />)}
        <Regel l="Totaal" r={euro(data.totaalActiva)} vet />
        <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700", marginTop: 6 }}>VERMOGEN EN SCHULDEN</Text>
        {data.passiva.map((p) => <Regel key={p.rgs + p.label} l={p.label} r={euro(p.bedrag)} />)}
        <Regel l="Totaal" r={euro(data.totaalPassiva)} vet />
      </Kaart>
      <Kaart titel="Kengetallen">
        {data.kengetallen.map((g) => <View key={g.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: k.tekst, fontSize: 14 }}>{g.label}</Text><Text style={{ color: k.tekst3, fontSize: 12 }}>{g.uitleg}</Text></View><Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600" }}>{g.waarde}</Text></View>)}
      </Kaart>
      <Kaart titel="Correcties (memoriaal)">
        {data.memoriaal.length === 0 && !correctie && <Tekst kleur="3" soort="klein">Geen correcties. Voor je boekhouder: een bedrag dat niet via de bank liep.</Tekst>}
        {data.memoriaal.map((m) => <Regel key={m.id} l={`${datumKort(m.datum)} ${m.omschrijving}`} r={euro(m.bedrag)} />)}
        {correctie ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Veld label="Datum" value={correctie.datum} onChangeText={(v) => setCorrectie({ ...correctie, datum: v })} /></View>
              <View style={{ flex: 1 }}><Veld label="Bedrag (+ kosten, − omzet)" value={correctie.bedrag} onChangeText={(v) => setCorrectie({ ...correctie, bedrag: v })} keyboardType="numbers-and-punctuation" /></View>
            </View>
            <Veld label="Omschrijving" value={correctie.omschrijving} onChangeText={(v) => setCorrectie({ ...correctie, omschrijving: v })} />
            <Kies label="Categorie" waarde={correctie.categorie} opties={data.categorieen.map((c) => ({ k: c.k, l: c.label }))} onChange={(v) => setCorrectie({ ...correctie, categorie: v })} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setCorrectie(null)} />
              <Knop tekst="Boeken" style={{ flex: 1 }} bezig={bezig === "memoriaalToevoegen"} onPress={() => doe("memoriaalToevoegen", { ...correctie, soort: "correctie", btwCode: "geen" }, "Correctie geboekt.")} />
            </View>
          </View>
        ) : <Knop tekst="Correctie boeken" soort="licht" klein onPress={() => setCorrectie({ datum: isoDatum(), omschrijving: "", bedrag: "", categorie: "overig" })} />}
      </Kaart>
      {!data.afgesloten && jaar < new Date().getFullYear() && <Knop tekst={`Jaar ${jaar} afsluiten`} soort="licht" bezig={bezig === "jaarAfsluiten"} onPress={() => Alert.alert("Jaar afsluiten", `De afschrijvingen van ${jaar} worden definitief geboekt.`, [{ text: "Annuleren", style: "cancel" }, { text: "Afsluiten", onPress: () => doe("jaarAfsluiten", { jaar }, `Jaar ${jaar} afgesloten.`) }])} />}
    </Scherm>
  );
}

function Regel({ l, r, vet }: { l: string; r: string; vet?: boolean }) {
  const k = useKleuren();
  return <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><Text style={{ color: vet ? k.tekst : k.tekst2, fontSize: 13, fontWeight: vet ? "700" : "400", flex: 1 }}>{l}</Text><Text style={{ color: k.tekst, fontSize: 13, fontWeight: vet ? "700" : "400", fontVariant: ["tabular-nums"] }}>{r}</Text></View>;
}
