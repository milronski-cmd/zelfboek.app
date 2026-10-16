import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ga } from "@/lib/navigatie";
import { Knop, useKleuren } from "@/components/ui";

const VOORBEELDEN = ["Hoeveel btw moet ik dit kwartaal betalen?", "Welke facturen staan open?", "Wat was mijn grootste kostenpost vorige maand?"];

/** Vraagbalk bovenaan het overzicht, zoals in de webapp: een vraag gaat naar de assistent, die meteen antwoordt. */
export function AiBalk() {
  const k = useKleuren();
  const [vraag, setVraag] = useState("");
  const stel = (q: string) => { const t = q.trim(); if (!t) return; setVraag(""); ga("/assistent", { q: t }); };
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: k.primair + "55", backgroundColor: k.wit, shadowColor: k.primair, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text style={{ color: k.primair, fontSize: 22 }} accessibilityElementsHidden>✦</Text>
        <TextInput value={vraag} onChangeText={setVraag} placeholder="Vraag het Saldoplan, bijvoorbeeld: hoe sta ik ervoor?" placeholderTextColor={k.tekst3} returnKeyType="send" onSubmitEditing={() => stel(vraag)} accessibilityLabel="Je vraag aan Saldoplan" style={{ flex: 1, fontSize: 16, color: k.tekst, paddingVertical: 8 }} />
        <Knop tekst="Vraag" klein disabled={!vraag.trim()} onPress={() => stel(vraag)} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text style={{ color: k.tekst3, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 }}>BIJVOORBEELD</Text>
        {VOORBEELDEN.map((v) => (
          <Pressable key={v} onPress={() => stel(v)} style={{ borderRadius: 999, borderWidth: 0.5, borderColor: k.lijn2, backgroundColor: k.papier, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: k.tekst2, fontSize: 12 }}>{v}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
