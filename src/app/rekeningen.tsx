import { useState } from "react";
import { Alert, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, wanneerNl } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Laden, Rij, Scherm, Tekst, Veld } from "@/components/ui";

type R = { id: string; naam: string; iban: string; bank: string | null; bron: string; saldo: number | null; laatsteSync: string | null; psd2Verloopt: string | null; aantal: number };

export default function Rekeningen() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rekeningen"], queryFn: () => api<{ rekeningen: R[] }>("/api/mobiel/rekeningen") });
  const ververs = useVervers();
  const [bewerk, setBewerk] = useState<{ id: string; naam: string } | null>(null);
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Rekeningen" sub="Je bankrekeningen in Saldoplan. Geef ze een eigen naam, bijvoorbeeld Zakelijk of Spaarpot." />
      {data.rekeningen.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Nog geen rekeningen. Koppel je bank onder Koppelingen.</Tekst></Kaart> : (
        <Kaart strak>
          {data.rekeningen.map((r, i) => <Rij key={r.id} titel={r.naam} sub={`${r.iban}${r.bank ? ` · ${r.bank}` : ""} · ${r.aantal} betalingen${r.laatsteSync ? ` · ${wanneerNl(r.laatsteSync)}` : ""}`} rechts={r.saldo != null ? euro(r.saldo) : ""} onPress={() => setBewerk({ id: r.id, naam: r.naam })} laatste={i === data.rekeningen.length - 1} />)}
        </Kaart>
      )}
      {bewerk && (
        <Kaart titel="Naam wijzigen">
          <Veld value={bewerk.naam} onChangeText={(v) => setBewerk({ ...bewerk, naam: v })} autoFocus />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setBewerk(null)} />
            <Knop tekst="Opslaan" style={{ flex: 1 }} onPress={async () => { const r = await actie("hernoemRekening", bewerk); if (!r.ok) Alert.alert("Mislukt", r.fout); setBewerk(null); await Promise.all([refetch(), ververs("transacties", "overzicht")]); }} />
          </View>
        </Kaart>
      )}
      <Knop tekst="Koppelingen" soort="tekst" onPress={() => ga("/koppelingen")} />
    </Scherm>
  );
}
