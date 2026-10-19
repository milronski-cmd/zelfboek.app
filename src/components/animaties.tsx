import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { Symbool } from "@/components/symbool";

/** Draaiende ring: een cirkel met één doorzichtige zijde die rondjes draait. Loopt op de native animator. */
export function Spinner({ kleur, maat = 20, dikte = 2.5 }: { kleur: string; maat?: number; dikte?: number }) {
  const [hoek] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const lus = Animated.loop(Animated.timing(hoek, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
    lus.start();
    return () => lus.stop();
  }, [hoek]);
  return (
    <Animated.View style={{ width: maat, height: maat, borderRadius: maat / 2, borderWidth: dikte, borderColor: kleur, borderTopColor: "transparent", opacity: 0.95, transform: [{ rotate: hoek.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }} />
  );
}

/** Vinkje dat inpopt: eerst iets te groot, dan terug naar normaal. Optioneel in een gekleurd rondje. */
export function Vinkje({ kleur, maat = 20, rond, achter }: { kleur: string; maat?: number; rond?: boolean; achter?: string }) {
  const [schaal] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(schaal, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 260, mass: 0.6 }).start();
  }, [schaal]);
  const inhoud = <Symbool name="checkmark" tintColor={kleur} size={rond ? maat * 0.55 : maat} weight="bold" />;
  return (
    <Animated.View style={{ transform: [{ scale: schaal }], opacity: schaal.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }) }}>
      {rond ? <View style={{ width: maat, height: maat, borderRadius: maat / 2, backgroundColor: achter ?? kleur, alignItems: "center", justifyContent: "center" }}>{inhoud}</View> : inhoud}
    </Animated.View>
  );
}

/** Kruisje voor als het misging; schudt kort heen en weer. */
export function Kruisje({ kleur, maat = 20 }: { kleur: string; maat?: number }) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.timing(x, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(x, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [x]);
  return (
    <Animated.View style={{ transform: [{ translateX: x.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }) }] }}>
      <Symbool name="xmark" tintColor={kleur} size={maat} weight="bold" />
    </Animated.View>
  );
}

export type Uitkomst = "ok" | "fout";

/**
 * Houdt bij wat een knop moet tonen: niets, de spinner, of kort een vinkje of kruisje.
 * `bezig` komt van de aanroeper; de uitkomst komt van `luister` (liep de laatste server-actie goed af?) of van `expliciet`.
 */
export function useKnopFase(bezig: boolean | undefined, luister: (zet: (u: Uitkomst) => void) => () => void, expliciet?: Uitkomst | null): "rust" | "bezig" | Uitkomst {
  const aan = Boolean(bezig);
  const [laatste, setLaatste] = useState<Uitkomst | null>(null);
  const [toon, setToon] = useState<Uitkomst | null>(null);
  const [vorige, setVorige] = useState(aan);
  // Overgang van bezig naar klaar: de uitkomst even laten zien. Overgang naar bezig: schoon beginnen.
  if (aan !== vorige) {
    setVorige(aan);
    if (aan) { setLaatste(null); setToon(null); } else setToon(expliciet ?? laatste);
  }
  useEffect(() => {
    if (!aan) return undefined;
    return luister(setLaatste);
  }, [aan, luister]);
  useEffect(() => {
    if (!toon) return undefined;
    const t = setTimeout(() => setToon(null), toon === "ok" ? 1100 : 1400);
    return () => clearTimeout(t);
  }, [toon]);
  return aan ? "bezig" : toon ?? "rust";
}
