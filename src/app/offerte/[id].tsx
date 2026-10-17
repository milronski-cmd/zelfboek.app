import { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumNl, datumKort } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import type { Klant, Offerte } from "@/lib/types";
import { Totaalregel } from "@/components/regels";
import { Fout, Kaart, Laden, Melding, Pil, Rij, Scherm, Tekst, useKleuren } from "@/components/ui";
import { Acties } from "@/components/acties";

type Detail = { offerte: Offerte; klant: Klant; facturen: { id: string; nummer: string }[]; link: string; pdf: string };

/** Eén offerte: versturen, de klant tekent online, dan met één klik een factuur. */
export default function OfferteDetail() {
  const k = useKleuren();
  const { id, melding: startMelding } = useLocalSearchParams<{ id: string; melding?: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["offerte", id], queryFn: () => api<Detail>(`/api/mobiel/offertes/${id}`) });
  const ververs = useVervers();
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(startMelding ? { soort: "ok", tekst: startMelding } : null);
  const [bezig, setBezig] = useState<string | null>(null);
  const doe = async (naam: string, velden: Record<string, string> = {}, okTekst = "Gedaan.") => {
    setBezig(naam); setMelding(null);
    try {
      const r = await actie(naam, { id, ...velden });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding || okTekst } : { soort: "fout", tekst: r.fout });
      await Promise.all([refetch(), ververs("offertes", "facturen", "overzicht")]);
      if (naam === "offerteNaarFactuur" && r.ok && r.id) ga("/factuur/[id]", { id: r.id, melding: r.melding });
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (error || !data) return <Scherm ververs={refetch}><Fout fout={error ?? "Niet gevonden"} opnieuw={refetch} /></Scherm>;
  const { offerte: x, klant } = data;
  const open = ["verzonden", "geaccepteerd"].includes(x.status);
  return (
    <Scherm ververs={refetch}>
      <Stack.Screen options={{ title: `Offerte ${x.nummer}` }} />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Tekst kleur="2" soort="klein">Aan</Tekst>
            <Text style={{ color: k.tekst, fontSize: 16, fontWeight: "600" }}>{klant.naam}</Text>
            {klant.email ? <Tekst kleur="3" soort="klein">{klant.email}</Tekst> : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Pil kleur={STATUS_KLEUR[x.status] ?? "grijs"}>{STATUS_TEKST[x.status] ?? x.status}</Pil>
            <Tekst kleur="2" soort="klein">{datumNl(x.datum)}</Tekst>
            <Tekst kleur="2" soort="klein">Geldig tot {datumKort(x.geldigTot)}</Tekst>
          </View>
        </View>
        {x.getekendDoor && <Tekst kleur="2" soort="klein">Getekend door {x.getekendDoor}{x.getekendOp ? ` op ${datumNl(x.getekendOp)}` : ""}.</Tekst>}
        <View style={{ gap: 6, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          {x.regels.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: k.tekst, fontSize: 14, flex: 1 }}>{r.omschrijving}<Text style={{ color: k.tekst3 }}>  {r.aantal} {r.eenheid ?? ""} × {euro(r.prijs)}</Text></Text>
              <Text style={{ color: k.tekst, fontSize: 14, fontVariant: ["tabular-nums"] }}>{euro(r.aantal * r.prijs)}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 4, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          <Totaalregel label="Subtotaal" waarde={euro(x.subtotaal)} /><Totaalregel label="Btw" waarde={euro(x.btw)} /><Totaalregel label="Totaal" waarde={euro(x.totaal)} vet />
        </View>
        {x.opmerking ? <Tekst kleur="2" soort="klein">{x.opmerking}</Tekst> : null}
        {data.facturen.length > 0 && <Tekst kleur="2" soort="klein">Factuur: {data.facturen.map((f) => f.nummer).join(", ")}</Tekst>}
      </Kaart>
      <Acties acties={[
        (x.status === "concept" || x.status === "verzonden") && { tekst: x.status === "concept" ? "Versturen" : "Opnieuw sturen", sf: "paperplane", soort: x.status === "concept" ? "primair" : undefined, bezig: bezig === "offerteVerzenden", onPress: () => doe("offerteVerzenden", {}, "Offerte verstuurd.") },
        (x.status === "geaccepteerd" || x.status === "verzonden") && { tekst: "Factuur maken", sf: "doc.text", soort: x.status === "geaccepteerd" ? "primair" : undefined, bezig: bezig === "offerteNaarFactuur", onPress: () => doe("offerteNaarFactuur") },
        { tekst: "PDF", sf: "eye", onPress: () => ga("/pdf", { pad: data.pdf, naam: `${x.nummer}.pdf`, titel: `Offerte ${x.nummer}` }) },
        x.status === "concept" && { tekst: "Bewerken", sf: "pencil", onPress: () => ga("/offerte/nieuw", { id: x.id }) },
        x.status !== "concept" && { tekst: "Link delen", sf: "square.and.arrow.up", onPress: () => Share.share({ message: `Offerte ${x.nummer}: ${data.link}`, url: data.link }) },
        x.status === "verzonden" && { tekst: "Geaccepteerd", sf: "checkmark.seal", onPress: () => doe("offerteStatus", { status: "geaccepteerd" }) },
        open && { tekst: "Afgewezen", sf: "hand.thumbsdown", soort: "gevaar", bezig: bezig === "offerteStatus", onPress: () => Alert.alert("Afgewezen", "De offerte krijgt de status afgewezen.", [{ text: "Annuleren", style: "cancel" }, { text: "Afgewezen", style: "destructive", onPress: () => doe("offerteStatus", { status: "afgewezen" }) }]) },
      ]} />
      <Kaart strak><Rij titel={klant.naam} sub="Klant" onPress={() => ga("/klant/[id]", { id: klant.id })} laatste /></Kaart>
    </Scherm>
  );
}
