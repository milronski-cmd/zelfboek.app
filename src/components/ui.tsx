/**
 * Bouwstenen van de app, in de stijl van de webapp: witte kaarten op lichtgrijs, compacte rijen,
 * rechthoekige statuslabels, één merkkleur voor de hoofdactie.
 */
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Kleuren, Radius, Ruimte, type Palet } from "@/constants/theme";

export function useKleuren(): Palet {
  const schema = useColorScheme();
  return schema === "dark" ? Kleuren.donker : Kleuren.licht;
}

/** Scherm met lichtgrijze achtergrond, scrollbaar, met trek-om-te-verversen. */
export function Scherm({ children, ververs, bezig, rand = true, onder = true, style }: {
  children: ReactNode; ververs?: () => Promise<unknown> | void; bezig?: boolean; rand?: boolean; onder?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const k = useKleuren();
  const [trekt, setTrekt] = useState(false);
  const opTrek = useCallback(async () => { setTrekt(true); try { await ververs?.(); } finally { setTrekt(false); } }, [ververs]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: k.papier }}
      contentContainerStyle={[{ padding: rand ? Ruimte.l : 0, paddingBottom: onder ? 120 : 0, gap: Ruimte.l }, style]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={ververs ? <RefreshControl refreshing={trekt || Boolean(bezig)} onRefresh={opTrek} tintColor={k.tekst3} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Veilig({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const k = useKleuren();
  return <SafeAreaView style={[{ flex: 1, backgroundColor: k.papier }, style]}>{children}</SafeAreaView>;
}

export function Kaart({ children, titel, actie, style, strak }: { children: ReactNode; titel?: string; actie?: ReactNode; style?: StyleProp<ViewStyle>; strak?: boolean }) {
  const k = useKleuren();
  return (
    <View style={[st.kaart, { backgroundColor: k.wit, borderColor: k.lijn }, style]}>
      {(titel || actie) && (
        <View style={[st.kaartKop, { borderBottomColor: k.lijn }]}>
          {titel ? <Text style={[st.kaartTitel, { color: k.tekst }]}>{titel}</Text> : <View />}
          {actie}
        </View>
      )}
      <View style={strak ? undefined : st.kaartInhoud}>{children}</View>
    </View>
  );
}

/** Rij in een lijst: titel, ondertitel, rechts een bedrag of label, optioneel met pijl. */
export function Rij({ titel, sub, rechts, rechtsSub, onPress, laatste, links, kleurRechts, nummer }: {
  titel: string; sub?: string | null; rechts?: string | ReactNode; rechtsSub?: string; onPress?: () => void; laatste?: boolean; links?: ReactNode; kleurRechts?: string; nummer?: boolean;
}) {
  const k = useKleuren();
  const inhoud = (
    <View style={[st.rij, { borderBottomColor: k.lijn, borderBottomWidth: laatste ? 0 : StyleSheet.hairlineWidth }]}>
      {links}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[st.rijTitel, { color: k.tekst }]} numberOfLines={1}>{titel}</Text>
        {sub ? <Text style={[st.rijSub, { color: k.tekst2 }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {rechts != null && (
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {typeof rechts === "string" ? <Text style={[st.rijRechts, { color: kleurRechts ?? k.tekst, fontVariant: nummer === false ? undefined : ["tabular-nums"] }]}>{rechts}</Text> : rechts}
          {rechtsSub ? <Text style={[st.rijSub, { color: k.tekst3 }]}>{rechtsSub}</Text> : null}
        </View>
      )}
      {onPress && <Text style={{ color: k.tekst3, fontSize: 18, marginLeft: 2 }}>›</Text>}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? k.papier : "transparent" })}>{inhoud}</Pressable> : inhoud;
}

export function Pil({ kleur = "grijs", children }: { kleur?: "groen" | "geel" | "rood" | "grijs" | "blauw"; children: ReactNode }) {
  const k = useKleuren();
  const achter = { groen: k.groen, geel: "#b45309", rood: k.rood, grijs: "#646d80", blauw: k.primair }[kleur];
  return (
    <View style={[st.pil, { backgroundColor: achter }]}>
      <Text style={st.pilTekst}>{children}</Text>
    </View>
  );
}

export function Knop({ tekst, soort = "primair", bezig, klein, style, ...rest }: PressableProps & { tekst: string; soort?: "primair" | "licht" | "tekst" | "rood" | "groen"; bezig?: boolean; klein?: boolean; style?: StyleProp<ViewStyle> }) {
  const k = useKleuren();
  const achter = { primair: k.primair, licht: k.wit, tekst: "transparent", rood: k.rood, groen: k.groen }[soort];
  const voor = { primair: "#fff", licht: k.tekst, tekst: k.primairTekst, rood: "#fff", groen: "#fff" }[soort];
  return (
    <Pressable
      {...rest}
      disabled={rest.disabled || bezig}
      style={({ pressed }) => [
        st.knop, klein && st.knopKlein,
        { backgroundColor: achter, borderColor: soort === "licht" ? k.lijn2 : achter, opacity: rest.disabled ? 0.5 : pressed ? 0.85 : 1 },
        soort === "tekst" && { borderWidth: 0, paddingHorizontal: 6 },
        style,
      ]}
    >
      {bezig ? <ActivityIndicator color={voor} /> : <Text style={[st.knopTekst, klein && { fontSize: 13 }, { color: voor }]}>{tekst}</Text>}
    </Pressable>
  );
}

export function Veld({ label, hint, style, multiline, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  const k = useKleuren();
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={[st.lbl, { color: k.tekst2 }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={k.tekst3}
        multiline={multiline}
        {...rest}
        style={[st.veld, { backgroundColor: k.wit, color: k.tekst, borderColor: k.lijn2 }, multiline && { minHeight: 80, textAlignVertical: "top" }, style]}
      />
      {hint ? <Text style={[st.hint, { color: k.tekst3 }]}>{hint}</Text> : null}
    </View>
  );
}

/** Keuzeknoppen (chips), zoals de filterchips van de webapp. */
export function Chips<T extends string>({ opties, waarde, onChange, label }: { opties: { k: T; l: string }[]; waarde: T; onChange: (k: T) => void; label?: string }) {
  const k = useKleuren();
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={[st.lbl, { color: k.tekst2 }]}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {opties.map((o) => {
          const aan = o.k === waarde;
          return (
            <Pressable key={o.k} onPress={() => onChange(o.k)} style={[st.chip, { backgroundColor: aan ? k.primairLicht : k.wit, borderColor: aan ? k.primair : k.lijn2 }]}>
              <Text style={{ color: aan ? k.primairTekst : k.tekst2, fontSize: 13, fontWeight: "600" }}>{o.l}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function Schakel({ label, uitleg, aan, onChange }: { label: string; uitleg?: string; aan: boolean; onChange: (v: boolean) => void }) {
  const k = useKleuren();
  return (
    <Pressable onPress={() => onChange(!aan)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={[st.vinkje, { borderColor: aan ? k.primair : k.lijn2, backgroundColor: aan ? k.primair : k.wit }]}>{aan && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: k.tekst, fontSize: 15 }}>{label}</Text>
        {uitleg ? <Text style={[st.hint, { color: k.tekst3 }]}>{uitleg}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Tegel({ label, waarde, hint, accent }: { label: string; waarde: string; hint?: string; accent?: "groen" | "rood" | "geel" }) {
  const k = useKleuren();
  const kleur = accent === "groen" ? k.groenTekst : accent === "rood" ? k.roodTekst : accent === "geel" ? k.mosterdTekst : k.tekst;
  return (
    <View style={[st.tegel, { backgroundColor: k.wit, borderColor: k.lijn }]}>
      <Text style={[st.hint, { color: k.tekst2 }]}>{label}</Text>
      <Text style={{ color: kleur, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.3 }}>{waarde}</Text>
      {hint ? <Text style={[st.hint, { color: k.tekst3 }]} numberOfLines={2}>{hint}</Text> : null}
    </View>
  );
}

export function Cijferband({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Ruimte.m }}>{children}</View>;
}

export function Kop({ titel, sub, children }: { titel: string; sub?: string; children?: ReactNode }) {
  const k = useKleuren();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: k.tekst, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 }}>{titel}</Text>
      {sub ? <Text style={{ color: k.tekst2, fontSize: 14, lineHeight: 20 }}>{sub}</Text> : null}
      {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>{children}</View> : null}
    </View>
  );
}

export function Leeg({ tekst, actie }: { tekst: string; actie?: ReactNode }) {
  const k = useKleuren();
  return (
    <View style={[st.kaart, { backgroundColor: k.wit, borderColor: k.lijn, padding: 28, alignItems: "center", gap: 12 }]}>
      <Text style={{ color: k.tekst2, fontSize: 14, textAlign: "center", lineHeight: 20 }}>{tekst}</Text>
      {actie}
    </View>
  );
}

export function Laden({ tekst }: { tekst?: string }) {
  const k = useKleuren();
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={k.tekst3} />
      {tekst ? <Text style={[st.hint, { color: k.tekst3 }]}>{tekst}</Text> : null}
    </View>
  );
}

export function Melding({ soort = "fout", tekst, onSluit }: { soort?: "fout" | "ok" | "info"; tekst: string; onSluit?: () => void }) {
  const k = useKleuren();
  const stijl = soort === "fout" ? { bg: k.roodLicht, voor: k.roodTekst } : soort === "ok" ? { bg: k.groenLicht, voor: k.groenTekst } : { bg: k.primairLicht, voor: k.primairTekst };
  return (
    <Pressable onPress={onSluit} style={{ backgroundColor: stijl.bg, borderRadius: Radius.m, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={{ color: stijl.voor, fontSize: 14, lineHeight: 20 }}>{tekst}</Text>
    </Pressable>
  );
}

/** Foutscherm met opnieuw-knop, voor als een lijst niet laadt. */
export function Fout({ fout, opnieuw }: { fout: unknown; opnieuw?: () => void }) {
  const tekst = fout instanceof Error ? fout.message : String(fout);
  return <Leeg tekst={tekst} actie={opnieuw ? <Knop tekst="Opnieuw proberen" soort="licht" onPress={opnieuw} /> : undefined} />;
}

/** Kleine kop boven een groep. */
export function Groep({ titel, children, actie }: { titel: string; children: ReactNode; actie?: ReactNode }) {
  const k = useKleuren();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "600" }}>{titel}</Text>
        {actie}
      </View>
      {children}
    </View>
  );
}

export function Tekst({ children, kleur, soort = "normaal", style }: { children: ReactNode; kleur?: "2" | "3"; soort?: "normaal" | "klein" | "vet"; style?: StyleProp<TextStyle> }) {
  const k = useKleuren();
  return <Text style={[{ color: kleur === "2" ? k.tekst2 : kleur === "3" ? k.tekst3 : k.tekst, fontSize: soort === "klein" ? 13 : 15, lineHeight: soort === "klein" ? 18 : 21, fontWeight: soort === "vet" ? "600" : "400" }, style]}>{children}</Text>;
}

export const terug = () => (router.canGoBack() ? router.back() : router.replace("/"));

const st = StyleSheet.create({
  kaart: { borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  kaartKop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  kaartTitel: { fontSize: 15, fontWeight: "600" },
  kaartInhoud: { padding: 16, gap: 12 },
  rij: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11, minHeight: 50 },
  rijTitel: { fontSize: 15, fontWeight: "500" },
  rijSub: { fontSize: 13, lineHeight: 17, marginTop: 1 },
  rijRechts: { fontSize: 15, fontWeight: "600" },
  pil: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  pilTekst: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  knop: { minHeight: 44, paddingHorizontal: 16, borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  knopKlein: { minHeight: 34, paddingHorizontal: 12 },
  knopTekst: { fontSize: 15, fontWeight: "600" },
  lbl: { fontSize: 13, fontWeight: "500" },
  hint: { fontSize: 13, lineHeight: 18 },
  veld: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.s, borderWidth: StyleSheet.hairlineWidth, fontSize: 16 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
  vinkje: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  tegel: { flexGrow: 1, flexBasis: "45%", borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
});
