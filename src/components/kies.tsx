import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Knop, Veld, useKleuren } from "./ui";

export type Optie = { k: string; l: string; sub?: string };

/** Keuzelijst in een opschuifvenster (vervangt <select>): met zoekveld bij lange lijsten. */
export function Kies({ label, waarde, opties, onChange, placeholder = "Kies", hint, leegTekst }: {
  label?: string; waarde: string | null; opties: Optie[]; onChange: (k: string) => void; placeholder?: string; hint?: string; leegTekst?: string;
}) {
  const k = useKleuren();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const huidig = opties.find((o) => o.k === waarde);
  const lijst = zoek ? opties.filter((o) => `${o.l} ${o.sub ?? ""}`.toLowerCase().includes(zoek.toLowerCase())) : opties;
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={{ color: k.tekst2, fontSize: 13, fontWeight: "500" }}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6, borderWidth: 0.5, borderColor: k.lijn2, backgroundColor: k.wit, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, color: huidig ? k.tekst : k.tekst3, fontSize: 16 }} numberOfLines={1}>{huidig?.l ?? placeholder}</Text>
        <Text style={{ color: k.tekst3 }}>▾</Text>
      </Pressable>
      {hint ? <Text style={{ color: k.tekst3, fontSize: 13 }}>{hint}</Text> : null}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: k.papier }} edges={["bottom"]}>
          <View style={{ padding: 16, gap: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "600" }}>{label ?? placeholder}</Text>
              <Knop tekst="Sluiten" soort="tekst" onPress={() => setOpen(false)} />
            </View>
            {opties.length > 8 && <Veld placeholder="Zoeken" value={zoek} onChangeText={setZoek} autoFocus />}
            <FlatList
              data={lijst}
              keyExtractor={(o) => o.k}
              style={{ backgroundColor: k.wit, borderRadius: 8, borderWidth: 0.5, borderColor: k.lijn }}
              ListEmptyComponent={<Text style={{ color: k.tekst3, padding: 16 }}>{leegTekst ?? "Niets gevonden."}</Text>}
              renderItem={({ item }) => {
                const aan = item.k === waarde;
                return (
                  <Pressable onPress={() => { onChange(item.k); setOpen(false); setZoek(""); }} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: k.lijn, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: aan ? k.primairLicht : "transparent" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: aan ? k.primairTekst : k.tekst, fontSize: 15, fontWeight: aan ? "600" : "400" }}>{item.l}</Text>
                      {item.sub ? <Text style={{ color: k.tekst3, fontSize: 13 }}>{item.sub}</Text> : null}
                    </View>
                    {aan && <Text style={{ color: k.primairTekst }}>✓</Text>}
                  </Pressable>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
