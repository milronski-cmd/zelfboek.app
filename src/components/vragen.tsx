import { useState } from "react";
import { Text, View } from "react-native";
import { actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import type { Vraag } from "@/lib/types";
import { Kaart, Knop, Melding, Schakel, useKleuren } from "./ui";

/** De open vragen van Saldoplan ("zakelijk of privé?") met twee knoppen, zoals op het overzicht en bij Bank. */
export function Vragen({ vragen, compact }: { vragen: Vraag[]; compact?: boolean }) {
  const k = useKleuren();
  const ververs = useVervers();
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [altijd, setAltijd] = useState<Record<string, boolean>>({});
  if (vragen.length === 0) return null;
  const beantwoord = async (v: Vraag, keuze: "zakelijk" | "prive") => {
    setBezig(v.sleutel + keuze); setFout(null);
    try {
      const r = await actie("beantwoordVraag", { id: v.ids[0], ids: v.ids.join(","), keuze, altijd: altijd[v.sleutel] ? "1" : undefined });
      if (!r.ok) setFout(r.fout);
      await ververs("vragen", "overzicht", "transacties", "meldingen");
    } catch (e) { setFout(e instanceof Error ? e.message : "Dat lukte niet."); }
    finally { setBezig(null); }
  };
  // Op het overzicht één vraag tegelijk; de rest staat bij Bank.
  const lijst = compact ? vragen.slice(0, 1) : vragen;
  return (
    <Kaart titel={compact ? "Zakelijk of privé?" : `${vragen.length === 1 ? "1 vraag" : `${vragen.length} vragen`} van Saldoplan`} strak
      actie={compact && vragen.length > 1 ? <Text onPress={() => ga("/(tabs)/bank")} style={{ color: k.primairTekst, fontSize: 14, fontWeight: "600" }}>{`Nog ${vragen.length - 1}`}</Text> : undefined}>
      {fout && <View style={{ padding: 12 }}><Melding tekst={fout} onSluit={() => setFout(null)} /></View>}
      {lijst.map((v, i) => (
        <View key={v.sleutel} style={{ padding: 16, gap: 10, borderBottomWidth: i < lijst.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>{v.tegenpartij}</Text>
              <Text style={{ color: k.tekst2, fontSize: 13, marginTop: 2 }}>{v.datumTekst}{v.omschrijving ? ` · ${v.omschrijving}` : ""}</Text>
            </View>
            <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{v.bedragTekst}</Text>
          </View>
          <Text style={{ color: k.tekst2, fontSize: 13, lineHeight: 18 }}>Saldoplan denkt: {v.voorstel}{v.uitleg ? `. ${v.uitleg}` : ""}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Zakelijk" klein style={{ flex: 1 }} bezig={bezig === v.sleutel + "zakelijk"} onPress={() => beantwoord(v, "zakelijk")} />
            <Knop tekst="Privé" klein soort="licht" style={{ flex: 1 }} bezig={bezig === v.sleutel + "prive"} onPress={() => beantwoord(v, "prive")} />
          </View>
          {<Schakel label={`Onthoud dit voor ${v.tegenpartij}`} aan={Boolean(altijd[v.sleutel])} onChange={(aan) => setAltijd((a) => ({ ...a, [v.sleutel]: aan }))} />}
        </View>
      ))}
    </Kaart>
  );
}
