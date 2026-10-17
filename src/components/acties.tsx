import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { bijUitkomst } from "@/lib/api";
import { useKleuren } from "@/components/ui";
import { Kruisje, Spinner, Vinkje, useKnopFase, type Uitkomst } from "@/components/animaties";

/** Eén handeling op een detailscherm: icoon, korte tekst, en wat er moet gebeuren. */
export type Actie = {
  tekst: string; sf: SFSymbol; onPress: () => unknown;
  bezig?: boolean; uitkomst?: Uitkomst | null;
  /** primair = de ene donkere tegel die je het vaakst nodig hebt; gevaar = verwijderen en dergelijke. */
  soort?: "primair" | "gevaar";
};

/**
 * Handelingen als tegels in een raster van drie, met icoon en één korte tekst: dezelfde taal als de knoppen op
 * het overzicht. `false`/`null` in de lijst wordt overgeslagen, zodat je voorwaarden inline kunt schrijven.
 */
const TUSSEN = 10;

export function Acties({ acties }: { acties: (Actie | false | null | undefined)[] }) {
  const [breedte, setBreedte] = useState(0);
  const lijst = acties.filter((a): a is Actie => Boolean(a));
  if (lijst.length === 0) return null;
  // Een rij met één of twee tegels vult de breedte; drie per rij blijft het uitgangspunt. Alle tegels even groot.
  const kolommen = Math.min(3, lijst.length);
  const tegel = breedte > 0 ? Math.floor((breedte - TUSSEN * (kolommen - 1)) / kolommen) : 0;
  return (
    <View onLayout={(e) => setBreedte(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: TUSSEN }}>
      {tegel > 0 && lijst.map((a) => <Tegel key={a.tekst} actie={a} breedte={tegel} />)}
    </View>
  );
}

function Tegel({ actie, breedte }: { actie: Actie; breedte: number }) {
  const k = useKleuren();
  const [eigenBezig, setEigenBezig] = useState(false);
  const [eigenUitkomst, setEigenUitkomst] = useState<Uitkomst | null>(null);
  const gemonteerd = useRef(true);
  useEffect(() => () => { gemonteerd.current = false; }, []);
  const fase = useKnopFase(actie.bezig || eigenBezig, bijUitkomst, actie.uitkomst ?? eigenUitkomst);
  const [schaal] = useState(() => new Animated.Value(1));
  const veer = (naar: number) => Animated.spring(schaal, { toValue: naar, useNativeDriver: true, damping: 14, stiffness: 320, mass: 0.5 }).start();
  const druk = () => {
    const r = actie.onPress() as unknown;
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setEigenUitkomst(null); setEigenBezig(true);
      (r as Promise<unknown>).then(() => { if (gemonteerd.current) setEigenBezig(false); }, () => { if (gemonteerd.current) { setEigenUitkomst("fout"); setEigenBezig(false); } });
    }
  };
  const primair = actie.soort === "primair";
  const gevaar = actie.soort === "gevaar";
  const achter = fase === "fout" ? k.rood : primair ? k.donkerVlak : k.wit;
  const voor = fase === "fout" || primair ? "#fff" : gevaar ? k.roodTekst : k.tekst;
  const icoonKleur = fase === "fout" || primair ? "#fff" : gevaar ? k.roodTekst : k.primair;
  return (
    <Animated.View style={{ width: breedte, height: 92, transform: [{ scale: schaal }] }}>
      <Pressable onPress={druk} disabled={fase !== "rust"} accessibilityRole="button" accessibilityLabel={actie.tekst}
        onPressIn={() => veer(0.96)} onPressOut={() => veer(1)}
        style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8, borderRadius: 18, backgroundColor: achter, opacity: pressed ? 0.75 : 1 })}>
        <View style={{ height: 24, alignItems: "center", justifyContent: "center" }}>
          {fase === "bezig" ? <Spinner kleur={icoonKleur} maat={22} /> : fase === "ok" ? <Vinkje kleur={primair ? "#fff" : k.groenTekst} maat={22} /> : fase === "fout" ? <Kruisje kleur="#fff" maat={22} /> : <SymbolView name={actie.sf} tintColor={icoonKleur} size={22} weight="medium" />}
        </View>
        <Text numberOfLines={2} style={{ color: voor, fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 16 }}>{actie.tekst}</Text>
      </Pressable>
    </Animated.View>
  );
}
