import { useEffect, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { api, stream } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { Kies } from "@/components/kies";
import { Knop, Melding, Tekst, Veld, useKleuren } from "@/components/ui";

type Bericht = { rol: "user" | "assistant"; tekst: string; tool?: string };
type Antwoord = { beschikbaar: boolean; gesprekken: { id: string; titel: string; bijgewerkt: string }[]; berichten: Bericht[]; voorbeelden: string[] };
type Ev = { type: "tekst" | "tool" | "klaar" | "fout"; tekst?: string; naam?: string; gesprekId?: string };

/** Chat met Saldoplan over je eigen cijfers; antwoorden streamen binnen zoals in de webapp. */
export default function Assistent() {
  const k = useKleuren();
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["assistent", gesprekId], queryFn: () => api<Antwoord>(`/api/mobiel/assistent${gesprekId ? `?id=${gesprekId}` : ""}`) });
  const [berichten, setBerichten] = useState<Bericht[] | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const lijst = useRef<ComponentRef<typeof ScrollView>>(null);
  const ververs = useVervers();
  const getoond = berichten ?? data?.berichten ?? [];
  const { q } = useLocalSearchParams<{ q?: string }>();
  const gesteld = useRef<string | null>(null);

  const stuur = async (vraag: string) => {
    const t = vraag.trim();
    if (!t || bezig) return;
    setTekst(""); setFout(null); setBezig(true);
    const basis: Bericht[] = [...getoond, { rol: "user", tekst: t }, { rol: "assistant", tekst: "" }];
    setBerichten(basis);
    try {
      let laatste = basis[basis.length - 1];
      for await (const ev of stream<Ev>("/api/assistent", { gesprekId, bericht: t })) {
        laatste = { ...laatste };
        if (ev.type === "tekst") laatste.tekst += ev.tekst ?? "";
        if (ev.type === "tool") laatste.tool = ev.naam;
        if (ev.type === "fout") laatste.tekst += `${laatste.tekst ? "\n" : ""}${ev.tekst ?? ""}`;
        if (ev.type === "klaar" && ev.gesprekId) setGesprekId(ev.gesprekId);
        setBerichten([...basis.slice(0, -1), laatste]);
        lijst.current?.scrollToEnd({ animated: true });
      }
      await ververs("overzicht", "transacties", "meldingen");
    } catch (e) { setFout(e instanceof Error ? e.message : "De assistent is nu even niet bereikbaar."); }
    finally { setBezig(false); }
  };

  // Vraag uit de vraagbalk op het overzicht: meteen stellen zodra de assistent open is.
  useEffect(() => {
    if (q && gesteld.current !== q) { gesteld.current = q; void stuur(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: k.papier }} keyboardVerticalOffset={90}>
      <View style={{ flex: 1 }}>
        <View style={{ padding: 12, gap: 8, borderBottomWidth: 0.5, borderBottomColor: k.lijn, backgroundColor: k.wit }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}><Kies placeholder="Nieuw gesprek" waarde={gesprekId} opties={[{ k: "", l: "Nieuw gesprek" }, ...(data?.gesprekken ?? []).map((g) => ({ k: g.id, l: g.titel }))]} onChange={(v) => { setGesprekId(v || null); setBerichten(null); }} /></View>
            {gesprekId && <Knop tekst="Nieuw" soort="licht" klein onPress={() => { setGesprekId(null); setBerichten(null); }} />}
          </View>
          {data && !data.beschikbaar && <Melding soort="info" tekst="De assistent staat op deze server nog niet aan (geen AI-sleutel)." />}
        </View>
        <ScrollView ref={lijst} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }} onContentSizeChange={() => lijst.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
          {getoond.length === 0 && (
            <View style={{ gap: 10 }}>
              <Tekst kleur="2">Saldoplan kijkt in je eigen cijfers en legt uit. Iets wijzigen doet het pas na jouw ja.</Tekst>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(data?.voorbeelden ?? []).map((v) => <Pressable key={v} onPress={() => stuur(v)} style={{ backgroundColor: k.wit, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: k.lijn2 }}><Text style={{ color: k.tekst2, fontSize: 13 }}>{v}</Text></Pressable>)}
              </View>
            </View>
          )}
          {getoond.map((b, i) => (
            <View key={i} style={{ alignSelf: b.rol === "user" ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: b.rol === "user" ? k.primair : k.wit, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: b.rol === "user" ? 0 : 0.5, borderColor: k.lijn }}>
              {b.tool && !b.tekst && <Text style={{ color: k.tekst3, fontSize: 12, fontStyle: "italic" }}>Kijkt in je cijfers ({b.tool})…</Text>}
              <Text selectable style={{ color: b.rol === "user" ? "#fff" : k.tekst, fontSize: 15, lineHeight: 22 }}>{b.tekst || (b.rol === "assistant" && bezig ? "…" : "")}</Text>
            </View>
          ))}
          {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: 12, paddingBottom: 28, borderTopWidth: 0.5, borderTopColor: k.lijn, backgroundColor: k.wit, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}><Veld placeholder="Vraag het Saldoplan, bijvoorbeeld: hoe sta ik ervoor?" value={tekst} onChangeText={setTekst} multiline onSubmitEditing={() => stuur(tekst)} blurOnSubmit returnKeyType="send" style={{ minHeight: 44, maxHeight: 120 }} /></View>
          <Knop tekst="Vraag" bezig={bezig} disabled={!tekst.trim()} onPress={() => stuur(tekst)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
