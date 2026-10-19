import { useEffect, useState } from "react";
import { Animated, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { Symbool } from "@/components/symbool";
import { Image } from "expo-image";
import { useOverzicht } from "@/lib/queries";
import { euro, datumKort } from "@/lib/format";
import { ga, naarScherm } from "@/lib/navigatie";
import { Vragen } from "@/components/vragen";
import { Gloedrand } from "@/components/gloedrand";
import { Fout, Laden, Scherm, useKleuren } from "@/components/ui";
import type { Overzicht } from "@/lib/types";

/** Kleuren van de donkere kaart; in beide schema's donker, zodat hij altijd het blikvangend middelpunt is. */
const KAART = { achter: "#15181d", tekst: "#ffffff", tekst2: "rgba(255,255,255,0.62)", lijn: "rgba(255,255,255,0.12)" };

/** Startscherm: begroeting, de AI-kaart, drie knoppen en de laatste boekingen. */
export default function OverzichtScherm() {
  const { data, isLoading, error, refetch } = useOverzicht();
  const k = useKleuren();
  const [soort, setSoort] = useState<"in" | "uit">("uit");
  if (isLoading && !data) return <Scherm><Laden tekst="Je cijfers worden opgehaald" /></Scherm>;
  if (error && !data) return <Scherm ververs={refetch}><Fout fout={error} opnieuw={refetch} /></Scherm>;
  if (!data) return null;
  const d = data;
  const volgende = d.acties[0];
  const voornaam = d.naam.split(" ")[0];
  const lijst = d.recent.filter((r) => (soort === "in" ? r.bedrag > 0 : r.bedrag <= 0)).slice(0, 6);
  const achter = k.papier;

  return (
    <Scherm ververs={refetch} rand={false} style={{ gap: 0, backgroundColor: achter }}>
      <View style={{ paddingHorizontal: 20, gap: 20 }}>
        {/* Begroeting met avatar en instellingen. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: k.primair, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{voornaam.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={{ flex: 1, color: k.tekst, fontSize: 24, letterSpacing: -0.4 }} numberOfLines={1}>
            Hallo, <Text style={{ fontWeight: "700" }}>{voornaam}!</Text>
          </Text>
          <RondeKnop sf="gearshape" label="Instellingen" onPress={() => ga("/instellingen")} />
        </View>

        <AiKaart />

        {/* De drie dingen die je het vaakst doet. */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SnelKnop sf="camera" tekst="Bon" onPress={() => ga("/(tabs)/bonnen")} />
          <SnelKnop sf="doc.text" tekst="Factuur" onPress={() => ga("/factuur/nieuw")} />
          <SnelKnop sf="ellipsis" tekst="Meer" onPress={() => ga("/(tabs)/meer")} />
        </View>

        {d.nieuwAccount ? <EersteStappen stappen={d.stappen} /> : volgende ? (
          <Pressable onPress={() => naarScherm(volgende.scherm)} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18, backgroundColor: k.wit, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.mosterd }} />
            <Text style={{ flex: 1, color: k.tekst, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{volgende.tekst}</Text>
            <Symbool name="chevron.right" tintColor={k.tekst3} size={14} weight="semibold" />
          </Pressable>
        ) : null}

        <Vragen vragen={d.vragen} compact />
      </View>

      {/* Witte vel met de laatste boekingen. */}
      <View style={{ marginTop: 24, backgroundColor: k.wit, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 16, minHeight: 420 }}>
        <View style={{ alignSelf: "center", width: 56, height: 5, borderRadius: 3, backgroundColor: k.lijn2 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: k.tekst, fontSize: 22, fontWeight: "700", letterSpacing: -0.4 }}>Laatste boekingen</Text>
          <Pressable onPress={() => ga("/(tabs)/bank")} hitSlop={8}><Text style={{ color: k.tekst2, fontSize: 14, fontWeight: "600" }}>Alles</Text></Pressable>
        </View>

        <Schakelaar opties={[{ k: "in", l: "Inkomsten" }, { k: "uit", l: "Uitgaven" }]} waarde={soort} onChange={setSoort} achter={achter} />

        {lijst.length === 0 && (
          <Text style={{ color: k.tekst3, fontSize: 14, textAlign: "center", paddingVertical: 24 }}>Nog niets geboekt</Text>
        )}
        {lijst.map((r) => (
          <Pressable key={`${r.soort}${r.id}`} onPress={() => ga(r.soort === "bank" ? "/transactie/[id]" : "/factuur/[id]", { id: r.id })}
            style={({ pressed }) => [st.boeking, { borderColor: k.lijn, backgroundColor: pressed ? achter : k.wit }]}>
            <View style={[st.icoon, { backgroundColor: achter }]}>
              <Symbool name={icoonVoor(r)} tintColor={k.tekst} size={20} weight="regular" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: k.tekst, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{r.titel}</Text>
              <Text style={{ color: k.tekst3, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{datumKort(r.datum)}</Text>
            </View>
            <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{euro(Math.abs(r.bedrag))}</Text>
          </Pressable>
        ))}
      </View>
    </Scherm>
  );
}

/** De donkere kaart: Saldoplan AI. Typ een vraag of tik op de kaart voor de chat. */
function AiKaart() {
  const k = useKleuren();
  const [vraag, setVraag] = useState("");
  // Toetsenbord eerst helemaal weg, dan schuift de chat als kaart omhoog met de vraag er al in.
  const stel = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setVraag("");
    if (!Keyboard.isVisible()) { ga("/assistent", { q: t }); return; }
    const sub = Keyboard.addListener("keyboardDidHide", () => { sub.remove(); ga("/assistent", { q: t }); });
    Keyboard.dismiss();
  };
  return (
    <View style={{ backgroundColor: KAART.achter, borderRadius: 28, padding: 22, gap: 22 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Image source={require("../../../assets/images/ai-merk.png")} style={{ width: 28, height: 28 }} contentFit="contain" accessibilityLabel="Saldoplan" />
            <Text style={{ color: KAART.tekst, fontSize: 17, fontWeight: "700" }}>AI</Text>
          </View>
        </View>

        <Gloedrand kleur={k.primair} straal={18}>
          <Pressable onPress={() => ga("/assistent")} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 18, backgroundColor: "#23272e", paddingLeft: 16, paddingRight: 6, paddingVertical: 6 }}>
            <TextInput value={vraag} onChangeText={setVraag} placeholder="Vraag iets over je cijfers" placeholderTextColor={KAART.tekst2} returnKeyType="send" onSubmitEditing={() => stel(vraag)}
              accessibilityLabel="Je vraag aan Saldoplan" style={{ flex: 1, color: KAART.tekst, fontSize: 16, paddingVertical: 8 }} />
            <Pressable onPress={() => stel(vraag)} disabled={!vraag.trim()} accessibilityLabel="Vraag versturen"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: vraag.trim() ? k.primair : "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
              <Symbool name="arrow.up" tintColor="#fff" size={16} weight="bold" />
            </Pressable>
          </Pressable>
        </Gloedrand>

    </View>
  );
}

function RondeKnop({ sf, label, onPress }: { sf: SFSymbol; label: string; onPress: () => void }) {
  const k = useKleuren();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: k.wit, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
      <Symbool name={sf} tintColor={k.tekst} size={20} weight="medium" />
    </Pressable>
  );
}

/** Vierkante knop met icoon en één woord. */
function SnelKnop({ sf, tekst, onPress }: { sf: SFSymbol; tekst: string; onPress: () => void }) {
  const k = useKleuren();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tekst}
      style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 12, paddingVertical: 22, borderRadius: 20, backgroundColor: k.wit, opacity: pressed ? 0.7 : 1 })}>
      <Symbool name={sf} tintColor={k.tekst} size={22} weight="medium" />
      <Text style={{ color: k.tekst, fontSize: 16, fontWeight: "600" }}>{tekst}</Text>
    </Pressable>
  );
}

/** Twee keuzes naast elkaar; de donkere pil glijdt met een veertje naar de gekozen kant. */
function Schakelaar<T extends string>({ opties, waarde, onChange, achter }: { opties: { k: T; l: string }[]; waarde: T; onChange: (k: T) => void; achter: string }) {
  const k = useKleuren();
  const [breedte, setBreedte] = useState(0);
  const [positie] = useState(() => new Animated.Value(opties.findIndex((o) => o.k === waarde)));
  const [kleuren] = useState(() => opties.map((o) => new Animated.Value(o.k === waarde ? 1 : 0)));
  useEffect(() => {
    const i = opties.findIndex((o) => o.k === waarde);
    Animated.spring(positie, { toValue: i, useNativeDriver: true, damping: 18, stiffness: 180, mass: 0.8 }).start();
    kleuren.forEach((v, j) => Animated.timing(v, { toValue: j === i ? 1 : 0, duration: 180, useNativeDriver: false }).start());
  }, [waarde, opties, positie, kleuren]);
  const vak = breedte > 0 ? (breedte - 8) / opties.length : 0;
  return (
    <View onLayout={(e) => setBreedte(e.nativeEvent.layout.width)} style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: achter }}>
      {vak > 0 && (
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: vak, borderRadius: 999, backgroundColor: KAART.achter, transform: [{ translateX: Animated.multiply(positie, vak) }] }} />
      )}
      {opties.map((o, i) => (
        <Pressable key={o.k} onPress={() => onChange(o.k)} accessibilityRole="button" accessibilityState={{ selected: o.k === waarde }} style={{ flex: 1, paddingVertical: 12, alignItems: "center" }}>
          <Animated.Text style={{ color: kleuren[i].interpolate({ inputRange: [0, 1], outputRange: [k.tekst2, "#ffffff"] }), fontSize: 15, fontWeight: "600" }}>{o.l}</Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

function icoonVoor(r: Overzicht["recent"][number]): SFSymbol {
  if (r.soort === "factuur") return "doc.text";
  const t = `${r.titel} ${r.sub}`.toLowerCase();
  if (/restaurant|cafe|café|eten|lunch|diner|horeca/.test(t)) return "fork.knife";
  if (/ns |ov-|trein|bus|taxi|uber|parkeer|shell|tank|benzine/.test(t)) return "car";
  if (/huur|energie|vattenfall|eneco|essent|water|kpn|ziggo|odido|verzeker/.test(t)) return "house";
  if (/salaris|loon|belasting/.test(t)) return "building.columns";
  if (/albert heijn|jumbo|lidl|aldi|plus |supermarkt/.test(t)) return "cart";
  return r.bedrag > 0 ? "arrow.down.left" : "arrow.up.right";
}

function EersteStappen({ stappen }: { stappen: Overzicht["stappen"] }) {
  const k = useKleuren();
  const klaar = stappen.filter((s) => s.klaar).length;
  const volgende = stappen.find((s) => !s.klaar);
  if (!volgende) return null;
  return (
    <Pressable onPress={() => naarScherm(volgende.scherm)} accessibilityRole="button"
      style={({ pressed }) => ({ gap: 12, padding: 16, borderRadius: 18, backgroundColor: k.wit, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>{volgende.titel}</Text>
        <Text style={{ color: k.tekst3, fontSize: 13, fontWeight: "600" }}>{klaar}/{stappen.length}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: k.lijn, overflow: "hidden" }}><View style={{ width: `${(klaar / stappen.length) * 100}%`, height: 6, backgroundColor: k.primair }} /></View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  boeking: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  icoon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
