import { useState } from "react";
import { router } from "expo-router";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import { api, bestandVeld } from "@/lib/api";
import { Kaart, Knop, Kop, Melding, Scherm, Tekst, Veld } from "@/components/ui";

/** Feedback uit de app, komt bij het team terecht op dezelfde plek als feedback uit de webapp. */
export default function Feedback() {
  const [tekst, setTekst] = useState("");
  const [scherm, setScherm] = useState<{ uri: string; naam: string; type: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const kies = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setScherm({ uri: r.assets[0].uri, naam: r.assets[0].fileName ?? "scherm.jpg", type: r.assets[0].mimeType ?? "image/jpeg" });
  };
  const verstuur = async () => {
    setBezig(true); setMelding(null);
    try {
      const fd = new FormData();
      fd.append("tekst", tekst);
      fd.append("scherm", "app");
      fd.append("toestel", `${Device.modelName ?? "iPhone"}, iOS ${Device.osVersion ?? ""}`.trim());
      if (scherm) fd.append("bestand", bestandVeld(scherm.uri, scherm.naam, scherm.type));
      await api("/api/mobiel/feedback", { form: fd });
      setMelding({ soort: "ok", tekst: "Dank je! We lezen alles en laten het je weten als we het hebben opgelost." });
      setTekst(""); setScherm(null);
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Versturen lukte niet." }); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      <Kop titel="Wat vind je van Saldoplan?" sub="Iets wat beter kan, niet werkt of juist fijn is? Schrijf het hier." />
      <Kaart>
        <Veld value={tekst} onChangeText={setTekst} multiline placeholder="Bijvoorbeeld: ik snap niet waar ik mijn btw-aangifte vind" style={{ minHeight: 120 }} autoFocus />
        <Knop tekst={scherm ? `Schermafbeelding: ${scherm.naam}` : "Schermafbeelding toevoegen (mag)"} soort="licht" klein onPress={kies} />
        {melding && <Melding soort={melding.soort} tekst={melding.tekst} />}
        {melding?.soort === "ok" ? <Knop tekst="Sluiten" onPress={() => router.back()} /> : <Knop tekst="Versturen" bezig={bezig} disabled={tekst.trim().length < 3} onPress={verstuur} />}
      </Kaart>
      <Tekst kleur="3" soort="klein">Je e-mailadres gaat mee, zodat we kunnen reageren.</Tekst>
    </Scherm>
  );
}
