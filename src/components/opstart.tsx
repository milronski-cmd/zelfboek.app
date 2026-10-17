import { useEffect, useState } from "react";
import { Animated, Easing, Image, StyleSheet, useWindowDimensions } from "react-native";
import * as SplashScreen from "expo-splash-screen";

/**
 * Opstartanimatie bij een koude start. Begint exact als het natieve opstartscherm (de S in het midden op wit),
 * neemt het dan over: de S schuift naar links terwijl "aldoplan" van links naar rechts tevoorschijn komt,
 * even vasthouden, en dan lost het geheel op in de app.
 *
 * Maten: het woordmerk is 4750 × 1250 (bijgesneden), de S beslaat de eerste 1250 × 1250. Het natieve
 * opstartscherm toont de S op 76 punten breed; alles hieronder is daarvan afgeleid, zodat er geen sprong zit.
 */
const S_BREEDTE = 76;
const K = S_BREEDTE / 1250;
const WOORD_BREEDTE = 4750 * K;
const HOOGTE = 1250 * K;

export function Opstart() {
  const { width, height } = useWindowDimensions();
  const [klaar, setKlaar] = useState(false);
  const [geladen, setGeladen] = useState(false); // het woordmerk is gedecodeerd: pas dan het natieve scherm weghalen
  const [t] = useState(() => new Animated.Value(0)); // 0 = alleen de S, 1 = het hele woordmerk
  const [weg] = useState(() => new Animated.Value(0)); // 0 = zichtbaar, 1 = opgelost
  useEffect(() => {
    if (!geladen) return undefined;
    void SplashScreen.hideAsync();
    let actief = true;
    Animated.sequence([
      Animated.delay(350),
      Animated.timing(t, { toValue: 1, duration: 650, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false }),
      Animated.delay(550),
      Animated.timing(weg, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start(() => { if (actief) setKlaar(true); });
    return () => { actief = false; };
  }, [geladen, t, weg]);
  if (klaar) return null;
  const cx = width / 2;
  const cy = height / 2;
  return (
    <Animated.View pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: "#ffffff", opacity: weg.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
      <Animated.View style={{
        position: "absolute", top: cy - HOOGTE / 2, height: HOOGTE, overflow: "hidden",
        left: t.interpolate({ inputRange: [0, 1], outputRange: [cx - S_BREEDTE / 2, cx - WOORD_BREEDTE / 2] }),
        width: t.interpolate({ inputRange: [0, 1], outputRange: [S_BREEDTE, WOORD_BREEDTE] }),
        transform: [{ scale: weg.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
      }}>
        <Image source={require("../../assets/images/woordmerk.png")} onLoad={() => setGeladen(true)} style={{ width: WOORD_BREEDTE, height: HOOGTE }} resizeMode="stretch" accessibilityLabel="Saldoplan" />
      </Animated.View>
    </Animated.View>
  );
}
