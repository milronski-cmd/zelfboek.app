import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { api, actie, bestandVeld } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Melding, Scherm, Tekst, Veld } from "@/components/ui";

type Pakket = "moneybird" | "eboekhouden" | "jortt" | "excel" | "paypal";
const PAKKETTEN: { k: Pakket; l: string; uitleg: string }[] = [
  { k: "moneybird", l: "Moneybird", uitleg: "Koppel Moneybird eerst onder Koppelingen (inloggen bij Moneybird). Daarna neemt Saldoplan klanten, facturen, bankregels en inkoopfacturen over." },
  { k: "eboekhouden", l: "e-Boekhouden", uitleg: "Met je API-token uit e-Boekhouden: relaties, bankregels en boekingen." },
  { k: "jortt", l: "Jortt", uitleg: "Kies de CSV-export van Jortt." },
  { k: "excel", l: "Excel", uitleg: "Kies een .xlsx volgens het sjabloon (te downloaden in de webapp onder Overstappen)." },
  { k: "paypal", l: "PayPal", uitleg: "Kies het CSV-activiteitenrapport van PayPal." },
];

/** Overstappen: dezelfde import als de webapp. Dubbele gegevens slaat Saldoplan over; daarna boekt de AI de nieuwe regels. */
export default function Importeren() {
  const ververs = useVervers();
  const [pakket, setPakket] = useState<Pakket>("moneybird");
  const [token, setToken] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const info = PAKKETTEN.find((p) => p.k === pakket)!;
  const start = async () => {
    setBezig(true); setMelding(null);
    try {
      if (pakket === "eboekhouden" && token) {
        const r = await actie("koppelingOpslaan", { soort: "eboekhouden", token });
        if (!r.ok) { setMelding({ soort: "fout", tekst: r.fout }); return; }
      }
      const fd = new FormData();
      fd.append("naam", "importeerVanPakket");
      fd.append("pakket", pakket);
      if (pakket === "jortt" || pakket === "excel" || pakket === "paypal") {
        const r = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true });
        if (r.canceled || !r.assets[0]) return;
        fd.append("bestand", bestandVeld(r.assets[0].uri, r.assets[0].name, r.assets[0].mimeType ?? "application/octet-stream"));
      }
      const uit = await api<{ ok: boolean; melding?: string; fout?: string }>("/api/mobiel/actie", { form: fd });
      setMelding(uit.ok ? { soort: "ok", tekst: uit.melding ?? "Gegevens overgenomen." } : { soort: "fout", tekst: uit.fout ?? "Overnemen lukte niet." });
      await ververs();
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Overnemen lukte niet." }); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      <Kop titel="Overstappen" sub="Neem klanten, facturen en betalingen over uit je vorige pakket. Dubbele gegevens slaat Saldoplan over." />
      <Kaart titel="Van welk pakket?">
        {PAKKETTEN.map((p) => <Knop key={p.k} tekst={p.l} soort={pakket === p.k ? "primair" : "licht"} klein onPress={() => setPakket(p.k)} />)}
        <Tekst kleur="2" soort="klein">{info.uitleg}</Tekst>
        {pakket === "moneybird" && <Knop tekst="Naar Koppelingen" soort="licht" klein onPress={() => ga("/koppelingen")} />}
        {pakket === "eboekhouden" && <Veld label="API-token van e-Boekhouden" value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry hint="Saldoplan bewaart het versleuteld en gebruikt het alleen om te lezen." />}
        {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
        <Knop tekst={pakket === "jortt" || pakket === "excel" || pakket === "paypal" ? "Kies bestand en neem over" : "Neem over"} bezig={bezig} disabled={pakket === "eboekhouden" && !token} onPress={start} />
      </Kaart>
    </Scherm>
  );
}
