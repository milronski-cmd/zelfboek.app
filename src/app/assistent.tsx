import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Animated, Easing, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useColorScheme } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { type SFSymbol } from "expo-symbols";
import { Symbool } from "@/components/symbool";
import { Image } from "expo-image";
import { api, stream } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { Gloedrand } from "@/components/gloedrand";
import { Spinner, Vinkje } from "@/components/animaties";
import { Verwijzingen, splitsActies } from "@/components/verwijzingen";
import { VoorstelKaart, splitsVoorstel, type Knopje, type VoorstelStatus } from "@/components/voorstel";
import { ga } from "@/lib/navigatie";
import { Melding, useKleuren } from "@/components/ui";

type Bericht = { rol: "user" | "assistant"; tekst: string; tool?: string; tools?: string[]; lokaal?: boolean; fout?: boolean; knop?: Knopje; voorstelStatus?: VoorstelStatus };
type Antwoord = { beschikbaar: boolean; gesprekken: { id: string; titel: string; bijgewerkt: string }[]; berichten: Bericht[]; voorbeelden: string[] };
type Ev = { type: "tekst" | "tool" | "klaar" | "fout"; tekst?: string; naam?: string; gesprekId?: string };

const DONKER = "#15181d";

/** Chat met Saldoplan over je eigen cijfers. Schuift als kaart omhoog vanaf het overzicht; de vraag uit de vraagbalk staat er meteen in. */
export default function Assistent() {
  const k = useKleuren();
  const donker = useColorScheme() === "dark";
  const achter = donker ? k.papier : "#f0f0f0";
  const rand = useSafeAreaInsets();
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["assistent", gesprekId], queryFn: () => api<Antwoord>(`/api/mobiel/assistent${gesprekId ? `?id=${gesprekId}` : ""}`) });
  const [berichten, setBerichten] = useState<Bericht[] | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [historie, setHistorie] = useState(false);
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
      for await (const ev of stream<Ev>("/api/assistent", { gesprekId, bericht: t, stijl: "kort" })) {
        laatste = { ...laatste };
        if (ev.type === "tekst") laatste.tekst += ev.tekst ?? "";
        if (ev.type === "tool") { laatste.tool = ev.naam; laatste.tools = [...(laatste.tools ?? []), ev.naam ?? ""]; }
        if (ev.type === "fout") laatste.tekst += `${laatste.tekst ? "\n" : ""}${ev.tekst ?? ""}`;
        if (ev.type === "klaar" && ev.gesprekId) setGesprekId(ev.gesprekId);
        setBerichten([...basis.slice(0, -1), laatste]);
        lijst.current?.scrollToEnd({ animated: true });
      }
      await ververs("overzicht", "transacties", "meldingen");
    } catch (e) { setFout(e instanceof Error ? e.message : "De assistent is nu even niet bereikbaar."); }
    finally { setBezig(false); }
  };

  // Vraag uit de vraagbalk op het overzicht: staat er al terwijl het scherm omhoog schuift.
  useEffect(() => {
    if (q && gesteld.current !== q) { gesteld.current = q; void stuur(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const nieuw = () => { setGesprekId(null); setBerichten(null); setFout(null); };
  // Uitkomst van een knop (herinnering gestuurd, betaald gemeld) als kort bericht in het gesprek, zonder de assistent te vragen.
  const meld = (tekst: string, isFout?: boolean, knop?: Knopje) => setBerichten((huidig) => [...(huidig ?? data?.berichten ?? []), { rol: "assistant", tekst, lokaal: true, fout: isFout, knop }]);
  // Voorstel bevestigd of geannuleerd: de kaart op slot en de uitkomst als regel eronder.
  const voorstelKlaar = (i: number, status: VoorstelStatus, tekst: string, isFout?: boolean, knop?: Knopje) =>
    setBerichten((huidig) => {
      const lijst = [...(huidig ?? data?.berichten ?? [])];
      if (lijst[i]) lijst[i] = { ...lijst[i], voorstelStatus: status };
      return [...lijst, { rol: "assistant", tekst, lokaal: true, fout: isFout, knop }];
    });
  const sluit = () => { Keyboard.dismiss(); if (router.canGoBack()) router.back(); else router.replace("/"); };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: achter }}>
      {/* Kop: gesprekken links, het merk in het midden, sluiten rechts. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <RondeKnop sf="clock.arrow.circlepath" label="Eerdere gesprekken" onPress={() => setHistorie(true)} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image source={require("../../assets/images/ai-merk.png")} style={{ width: 28, height: 28 }} contentFit="contain" accessibilityLabel="Saldoplan" />
          <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "700" }}>AI</Text>
        </View>
        <RondeKnop sf="xmark" label="Sluiten" onPress={sluit} />
      </View>

      <ScrollView ref={lijst} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 10, flexGrow: 1 }} onContentSizeChange={() => lijst.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {data && !data.beschikbaar && <Melding soort="info" tekst="De assistent staat op deze server nog niet aan." />}
        {getoond.length === 0 && !bezig && (
          <View style={{ flex: 1, justifyContent: "flex-end", gap: 8, paddingBottom: 8 }}>
            {(data?.voorbeelden ?? []).map((v, i) => (
              <Bel key={v} vertraging={i * 60}>
                <Pressable onPress={() => stuur(v)} style={({ pressed }) => ({ alignSelf: "flex-start", backgroundColor: k.wit, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: k.tekst, fontSize: 15 }}>{v}</Text>
                </Pressable>
              </Bel>
            ))}
          </View>
        )}
        {getoond.map((b, i) => {
          const vanJou = b.rol === "user";
          const laatsteBericht = i === getoond.length - 1;
          const wacht = !vanJou && !b.tekst && bezig && laatsteBericht;
          const klaar = !vanJou && !(bezig && laatsteBericht);
          const zonderActies = vanJou ? { tekst: b.tekst, acties: [] } : splitsActies(b.tekst);
          const { tekst: toon, voorstel } = vanJou ? { tekst: b.tekst, voorstel: null } : splitsVoorstel(zonderActies.tekst);
          const acties = zonderActies.acties;
          if (b.lokaal) return (
            <Bel key={i}>
              <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingHorizontal: 4, paddingVertical: 2 }}>
                {b.fout ? <Symbool name="exclamationmark.circle" tintColor={k.roodTekst} size={16} weight="semibold" /> : <Vinkje kleur="#fff" achter={k.groen} maat={18} rond />}
                <Text style={{ color: b.fout ? k.roodTekst : k.tekst2, fontSize: 14, flexShrink: 1 }}>{b.tekst}</Text>
                {b.knop ? <Pressable onPress={() => ga(b.knop!.pad, b.knop!.params)} style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: k.wit, borderWidth: 0.5, borderColor: k.lijn2, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: k.primairTekst, fontSize: 13, fontWeight: "600" }}>{b.knop.tekst}</Text></Pressable> : null}
              </View>
            </Bel>
          );
          return (
            <Bel key={i}>
              {(wacht || toon) ? (
                <View style={{ alignSelf: vanJou ? "flex-end" : "flex-start", maxWidth: "86%", backgroundColor: vanJou ? (donker ? k.primair : DONKER) : k.wit, borderRadius: 20, borderBottomRightRadius: vanJou ? 6 : 20, borderBottomLeftRadius: vanJou ? 20 : 6, paddingHorizontal: 16, paddingVertical: 12 }}>
                  {wacht ? <Stipjes kleur={k.tekst3} /> : (
                    vanJou ? <Text selectable style={{ color: "#fff", fontSize: 16, lineHeight: 23 }}>{toon}</Text> : <AntwoordTekst tekst={toon} />
                  )}
                  {wacht && b.tool ? <Text style={{ color: k.tekst3, fontSize: 12, marginTop: 6 }}>Kijkt in je cijfers</Text> : null}
                </View>
              ) : null}
              {klaar && voorstel ? <VoorstelKaart voorstel={voorstel} status={b.voorstelStatus} actief={laatsteBericht && !bezig} onKlaar={(st, t, f, kn) => voorstelKlaar(i, st, t, f, kn)} /> : null}
              {klaar && b.tekst && !voorstel ? <Verwijzingen tekst={toon} acties={acties} tools={b.tools ?? []} laatste={laatsteBericht && !bezig} onVraag={(t) => void stuur(t)} onMelding={meld} /> : null}
            </Bel>
          );
        })}
        {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
      </ScrollView>

      {/* Dezelfde balk als op het overzicht, zodat het één geheel voelt. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(rand.bottom, 12) + 4 }}>
        <Gloedrand kleur={k.primair} straal={22}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, borderRadius: 22, backgroundColor: DONKER, paddingLeft: 18, paddingRight: 6, paddingVertical: 6 }}>
            <TextInput value={tekst} onChangeText={setTekst} placeholder="Vraag iets over je cijfers" placeholderTextColor="rgba(255,255,255,0.55)" multiline returnKeyType="send" blurOnSubmit onSubmitEditing={() => stuur(tekst)}
              accessibilityLabel="Je vraag aan Saldoplan" style={{ flex: 1, color: "#fff", fontSize: 16, lineHeight: 21, paddingVertical: 9, maxHeight: 120 }} />
            <Pressable onPress={() => stuur(tekst)} disabled={!tekst.trim() || bezig} accessibilityLabel="Vraag versturen"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tekst.trim() && !bezig ? k.primair : "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 1 }}>
              {bezig ? <Spinner kleur="#fff" maat={16} dikte={2} /> : <Symbool name="arrow.up" tintColor="#fff" size={16} weight="bold" />}
            </Pressable>
          </View>
        </Gloedrand>
      </View>

      <Gesprekken open={historie} sluit={() => setHistorie(false)} huidig={gesprekId} gesprekken={data?.gesprekken ?? []}
        kies={(id) => { setHistorie(false); if (id) { setGesprekId(id); setBerichten(null); } else nieuw(); }} />
    </KeyboardAvoidingView>
  );
}

/** Lichte opmaak binnen een regel: **vet** wordt vet, een streepje aan het begin van een regel wordt een bolletje. */
function opmaak(tekst: string): ReactNode {
  const schoon = tekst.replace(/^#{1,3}\s+(.+)$/gm, "**$1**").replace(/^[-*] /gm, "\u2022 ");
  return schoon.split(/(\*\*[^*]+\*\*)/g).map((deel, i) =>
    deel.startsWith("**") && deel.endsWith("**") ? <Text key={i} style={{ fontWeight: "700" }}>{deel.slice(2, -2)}</Text> : deel,
  );
}

type Blok = { soort: "tekst"; tekst: string } | { soort: "tabel"; rijen: string[][] };

/** Markdown-tabellen uit het antwoord worden nette regels: eerste kolom vet, de rest erachter met puntjes ertussen. */
function splitsBlokken(tekst: string): Blok[] {
  const uit: Blok[] = [];
  let buf: string[] = [];
  let rijen: string[][] = [];
  let scheiding = false;
  const sluitTekst = () => { const t = buf.join("\n").trim(); if (t) uit.push({ soort: "tekst", tekst: t }); buf = []; };
  const sluitTabel = () => { if (rijen.length) uit.push({ soort: "tabel", rijen: scheiding ? rijen.slice(1) : rijen }); rijen = []; scheiding = false; };
  for (const regel of tekst.split("\n")) {
    const t = regel.trim();
    if (t.startsWith("|")) {
      sluitTekst();
      if (/^\|[\s:|-]+\|?$/.test(t)) { scheiding = true; continue; }
      rijen.push(t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).filter((c, i, a) => c || i < a.length - 1));
    } else {
      sluitTabel();
      buf.push(regel);
    }
  }
  sluitTekst(); sluitTabel();
  return uit;
}

/** Antwoord van de assistent: lopende tekst met lichte opmaak, tabellen als compacte regels. */
function AntwoordTekst({ tekst }: { tekst: string }) {
  const k = useKleuren();
  return (
    <View style={{ gap: 10 }}>
      {splitsBlokken(tekst).map((b, i) => b.soort === "tekst" ? (
        <Text key={i} selectable style={{ color: k.tekst, fontSize: 16, lineHeight: 23 }}>{opmaak(b.tekst)}</Text>
      ) : (
        <View key={i} style={{ borderRadius: 12, borderWidth: 0.5, borderColor: k.lijn, overflow: "hidden" }}>
          {b.rijen.map((r, j) => (
            <View key={j} style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 2, borderTopWidth: j ? 0.5 : 0, borderTopColor: k.lijn, backgroundColor: j % 2 ? "transparent" : k.papier + "80" }}>
              <Text selectable style={{ color: k.tekst, fontSize: 14, fontWeight: "600" }}>{opmaak(r[0] ?? "")}</Text>
              {r.length > 1 ? <Text selectable style={{ color: k.tekst2, fontSize: 13, lineHeight: 18 }}>{opmaak(r.slice(1).join(" \u00b7 "))}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function RondeKnop({ sf, label, onPress }: { sf: SFSymbol; label: string; onPress: () => void }) {
  const k = useKleuren();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: k.wit, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
      <Symbool name={sf} tintColor={k.tekst} size={17} weight="semibold" />
    </Pressable>
  );
}

/** Laat een bericht zacht verschijnen: iets omhoog en van doorzichtig naar zichtbaar. */
function Bel({ children, vertraging = 0 }: { children: ReactNode; vertraging?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, delay: vertraging, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, vertraging]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** Drie stipjes die om de beurt oplichten terwijl het antwoord onderweg is. */
function Stipjes({ kleur }: { kleur: string }) {
  const [a] = useState(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]);
  useEffect(() => {
    const lussen = a.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(480 - i * 160),
    ])));
    lussen.forEach((l) => l.start());
    return () => lussen.forEach((l) => l.stop());
  }, [a]);
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 6 }}>
      {a.map((v, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: kleur, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }} />
      ))}
    </View>
  );
}

/** Eerdere gesprekken in een opschuifvenster; bovenaan altijd "Nieuw gesprek". */
function Gesprekken({ open, sluit, huidig, gesprekken, kies }: { open: boolean; sluit: () => void; huidig: string | null; gesprekken: Antwoord["gesprekken"]; kies: (id: string | null) => void }) {
  const k = useKleuren();
  const rijen = [{ id: "", titel: "Nieuw gesprek" }, ...gesprekken];
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={sluit}>
      <SafeAreaView style={{ flex: 1, backgroundColor: k.papier }} edges={["bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
          <Text style={{ color: k.tekst, fontSize: 20, fontWeight: "700" }}>Gesprekken</Text>
          <RondeKnop sf="xmark" label="Sluiten" onPress={sluit} />
        </View>
        <FlatList data={rijen} keyExtractor={(g) => g.id || "nieuw"} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const aan = (item.id || null) === huidig;
            return (
              <Pressable onPress={() => kies(item.id || null)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: k.wit, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
                <Symbool name={item.id ? "bubble.left" : "plus"} tintColor={aan ? k.primairTekst : k.tekst2} size={16} weight="medium" />
                <Text style={{ flex: 1, color: aan ? k.primairTekst : k.tekst, fontSize: 15, fontWeight: aan || !item.id ? "600" : "400" }} numberOfLines={1}>{item.titel}</Text>
              </Pressable>
            );
          }} />
      </SafeAreaView>
    </Modal>
  );
}
