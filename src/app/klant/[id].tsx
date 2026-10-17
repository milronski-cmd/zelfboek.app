import { useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumKort, getal } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import type { Factuur, Klant, Offerte } from "@/lib/types";
import { Fout, Kaart, Knop, Laden, Melding, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";
import { Acties } from "@/components/acties";

type Detail = { klant: Klant; open: number; omzet: number; facturen: Factuur[]; offertes: Offerte[]; openUren: { uren: number; aantal: number } };

export default function KlantDetail() {
  const k = useKleuren();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["klant", id], queryFn: () => api<Detail>(`/api/mobiel/klanten/${id}`) });
  const ververs = useVervers();
  const [tarief, setTarief] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (error || !data) return <Scherm ververs={refetch}><Fout fout={error ?? "Niet gevonden"} opnieuw={refetch} /></Scherm>;
  const c = data.klant;
  const doe = async (naam: string, velden: Record<string, string> = {}) => {
    setBezig(naam); setMelding(null);
    try {
      const r = await actie(naam, { id, klantId: id, ...velden });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding || "Gedaan." } : { soort: "fout", tekst: r.fout });
      await Promise.all([refetch(), ververs("klanten", "facturen", "uren")]);
      if (naam === "klantVerwijderen" && r.ok) router.back();
      if (naam === "urenNaarFactuur" && r.ok && r.id) ga("/factuur/[id]", { id: r.id, melding: r.melding });
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  return (
    <Scherm ververs={refetch}>
      <Stack.Screen options={{ title: c.naam }} />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart>
        <Text style={{ color: k.tekst, fontSize: 18, fontWeight: "700" }}>{c.naam}</Text>
        {c.contactpersoon && <Tekst kleur="2" soort="klein">{c.contactpersoon}</Tekst>}
        {[c.adres, [c.postcode, c.plaats].filter(Boolean).join(" "), c.land !== "NL" ? c.land : null].filter(Boolean).map((r) => <Tekst key={String(r)} kleur="2" soort="klein">{r}</Tekst>)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {c.email && <Knop tekst={c.email} soort="tekst" klein onPress={() => Linking.openURL(`mailto:${c.email}`)} />}
          {c.telefoon && <Knop tekst={c.telefoon} soort="tekst" klein onPress={() => Linking.openURL(`tel:${c.telefoon}`)} />}
        </View>
        <View style={{ flexDirection: "row", gap: 16, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          <View><Tekst kleur="3" soort="klein">Open</Tekst><Text style={{ color: data.open > 0 ? k.mosterdTekst : k.tekst, fontSize: 17, fontWeight: "700" }}>{euro(data.open)}</Text></View>
          <View><Tekst kleur="3" soort="klein">Omzet (betaald)</Tekst><Text style={{ color: k.tekst, fontSize: 17, fontWeight: "700" }}>{euro(data.omzet)}</Text></View>
          {c.btwNummer && <View><Tekst kleur="3" soort="klein">Btw-nummer</Tekst><Text style={{ color: k.tekst, fontSize: 13 }}>{c.btwNummer}</Text></View>}
        </View>
        {c.notities && <Tekst kleur="2" soort="klein">{c.notities}</Tekst>}
      </Kaart>
      <Acties acties={[
        { tekst: "Nieuwe factuur", sf: "doc.text", soort: "primair", onPress: () => ga("/factuur/nieuw", { klantId: c.id }) },
        { tekst: "Nieuwe offerte", sf: "doc.plaintext", onPress: () => ga("/offerte/nieuw", { klantId: c.id }) },
        { tekst: "Bewerken", sf: "pencil", onPress: () => ga("/klant/nieuw", { id: c.id }) },
        data.facturen.length === 0 && { tekst: "Verwijderen", sf: "trash", soort: "gevaar", onPress: () => Alert.alert("Verwijderen", `${c.naam} wordt verwijderd.`, [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: () => doe("klantVerwijderen") }]) },
      ]} />
      {data.openUren.aantal > 0 && (
        <Kaart titel={`${getal(data.openUren.uren)} uur nog niet gefactureerd`}>
          <Tekst kleur="2" soort="klein">{data.openUren.aantal} urenregels. Uren zonder tarief krijgen het tarief hieronder.</Tekst>
          <Veld label="Uurtarief (als een regel er geen heeft)" value={tarief} onChangeText={setTarief} keyboardType="decimal-pad" placeholder="95" />
          <Knop tekst="Zet om in een factuur" bezig={bezig === "urenNaarFactuur"} onPress={() => doe("urenNaarFactuur", { uurtarief: tarief })} />
        </Kaart>
      )}
      <Kaart titel={`Facturen (${data.facturen.length})`} strak>
        {data.facturen.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12 }}>Nog geen facturen.</Tekst>}
        {data.facturen.map((f, i) => <Rij key={f.id} titel={f.nummer} sub={datumKort(f.datum)} rechts={euro(f.totaal)} links={<Pil kleur={STATUS_KLEUR[f.status] ?? "grijs"}>{STATUS_TEKST[f.status] ?? f.status}</Pil>} onPress={() => ga("/factuur/[id]", { id: f.id })} laatste={i === data.facturen.length - 1} />)}
      </Kaart>
      {data.offertes.length > 0 && (
        <Kaart titel="Offertes" strak>
          {data.offertes.map((x, i) => <Rij key={x.id} titel={x.nummer} sub={datumKort(x.datum)} rechts={euro(x.totaal)} links={<Pil kleur={STATUS_KLEUR[x.status] ?? "grijs"}>{STATUS_TEKST[x.status] ?? x.status}</Pil>} onPress={() => ga("/offerte/[id]", { id: x.id })} laatste={i === data.offertes.length - 1} />)}
        </Kaart>
      )}
    </Scherm>
  );
}
