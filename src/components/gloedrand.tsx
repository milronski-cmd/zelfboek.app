import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const Verloop = Animated.createAnimatedComponent(LinearGradient);

/**
 * Zachte gloed om een element, zoals het invoerveld van Gemini: een dun lichtrandje waar de kleur
 * langzaam omheen vloeit, met een diffuse schijn erbuiten die rustig ademt.
 * Licht voor de app: één draaiende verlooplaag en één schaduwlaag, allebei met de native animator,
 * dus niets wordt per frame opnieuw getekend op de JS-thread.
 */
export function Gloedrand({ children, kleur, kleurLicht = "#8fe0ff", straal, dikte = 1.5, duur = 7000, style }: {
  children: ReactNode; kleur: string; kleurLicht?: string; straal: number; dikte?: number; duur?: number; style?: StyleProp<ViewStyle>;
}) {
  const [maat, setMaat] = useState({ w: 0, h: 0 });
  const [hoek] = useState(() => new Animated.Value(0));
  const [adem] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const draai = Animated.loop(Animated.timing(hoek, { toValue: 1, duration: duur, easing: Easing.linear, useNativeDriver: true }));
    const puls = Animated.loop(Animated.sequence([
      Animated.timing(adem, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(adem, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    draai.start(); puls.start();
    return () => { draai.stop(); puls.stop(); };
  }, [hoek, adem, duur]);
  const opMaat = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMaat((m) => (m.w === width && m.h === height ? m : { w: width, h: height }));
  };
  // Het verloop is een vierkant zo groot als de diagonaal, zodat het bij elke draaihoek de hele rand bedekt.
  const zijde = Math.ceil(Math.hypot(maat.w, maat.h)) + 4;
  const rotate = hoek.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const buiten = straal + dikte;
  return (
    <View style={style}>
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: buiten, backgroundColor: kleur,
        opacity: adem.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.45] }),
        shadowColor: kleur, shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
      }} />
      <View onLayout={opMaat} style={{ borderRadius: buiten, padding: dikte, overflow: "hidden" }}>
        {maat.w > 0 && (
          <Verloop pointerEvents="none" colors={[kleur, kleurLicht, kleur, `${kleur}55`, kleur, kleurLicht, kleur]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ position: "absolute", width: zijde, height: zijde, left: (maat.w - zijde) / 2, top: (maat.h - zijde) / 2, transform: [{ rotate }] }} />
        )}
        {children}
      </View>
    </View>
  );
}
