import { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumNl, datumKort, dagenTussen, isoDatum } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import type { Factuur, Klant, Transactie } from "@/lib/types";
import { Totaalregel } from "@/components/regels";
import { Fout, Kaart, Knop, Laden, Melding, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

type Detail = {
  factuur: Factuur; klant: Klant; open: number; isOpen: boolean; teLaat: boolean; tijdlijn: { datum: string; tekst: string }[]; betalingen: Transactie[];
  credits: { id: string; nummer: string }[]; origineel: { id: string; nummer: string } | null; offerte: { id: string; nummer: string } | null; kandidaten: Transactie[]; peppol: boolean; link: string; pdf: string; ubl: string;
};

/** Eén factuur: zoals de klant hem ziet, met alles wat je ermee kunt doen. */
export default function FactuurDetail() {
  const k = useKleuren();
  const { id, melding: startMelding } = useLocalSearchParams<{ id: string; melding?: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["factuur", id], queryFn: () => api<Detail>(`/api/mobiel/facturen/${id}`) });
  const ververs = useVervers();
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(startMelding ? { soort: "ok", tekst: startMelding } : null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [betaal, setBetaal] = useState<{ bedrag: string; datum: string } | null>(null);
  const [credit, setCredit] = useState<string | null>(null);

  const doe = async (naam: string, velden: Record<string, string | undefined> = {}, okTekst = "Gedaan.") => {
    setBezig(naam); setMelding(null);
    try {
      const r = await actie(naam, { id, ...velden });
      if (!r.ok) setMelding({ soort: "fout", tekst: r.fout });
      else setMelding({ soort: "ok", tekst: r.melding || okTekst });
      if (naam === "factuurVerwijderen" && r.ok) {
        // Niet meer ophalen: de factuur bestaat niet meer. Eerst terug, dan de lijsten verversen.
        router.back();
        await ververs("facturen", "overzicht", "transacties", "klanten");
        return;
      }
      await Promise.all([refetch(), ververs("facturen", "overzicht", "transacties", "klanten")]);
      if (naam === "factuurCrediteren" && r.ok && r.id) ga("/factuur/[id]", { id: r.id, melding: r.melding });
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };

  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (error || !data) return <Scherm ververs={refetch}><Fout fout={error ?? "Niet gevonden"} opnieuw={refetch} /></Scherm>;
  const { factuur: f, klant } = data;
  const titel = `${f.soort === "credit" ? "Creditfactuur" : "Factuur"} ${f.nummer}`;
  const adres = [klant.adres, [klant.postcode, klant.plaats].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <Scherm ververs={refetch}>
      <Stack.Screen options={{ title: titel }} />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}

      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Tekst kleur="2" soort="klein">Aan</Tekst>
            <Text style={{ color: k.tekst, fontSize: 16, fontWeight: "600" }}>{klant.naam}</Text>
            {adres.map((r) => <Tekst key={r} kleur="2" soort="klein">{r}</Tekst>)}
            {klant.email ? <Tekst kleur="3" soort="klein">{klant.email}</Tekst> : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Pil kleur={data.teLaat && f.status === "verzonden" ? "rood" : STATUS_KLEUR[f.status] ?? "grijs"}>{STATUS_TEKST[f.status] ?? f.status}</Pil>
            <Tekst kleur="2" soort="klein">{datumNl(f.datum)}</Tekst>
            <Tekst kleur={data.teLaat ? undefined : "2"} soort="klein" style={data.teLaat ? { color: k.roodTekst } : undefined}>{data.teLaat ? `${dagenTussen(f.vervaldatum)} dagen te laat` : `Vervalt ${datumKort(f.vervaldatum)}`}</Tekst>
          </View>
        </View>
        {(f.btwVerlegd || f.referentie || data.origineel || data.credits.length > 0 || data.offerte) && (
          <View style={{ gap: 2, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 8 }}>
            {f.btwVerlegd && <Tekst kleur="2" soort="klein">Btw verlegd naar de klant.</Tekst>}
            {f.referentie && <Tekst kleur="2" soort="klein">Referentie: {f.referentie}</Tekst>}
            {data.offerte && <Tekst kleur="2" soort="klein">Uit offerte {data.offerte.nummer}</Tekst>}
            {data.origineel && <Tekst kleur="2" soort="klein">Credit op factuur {data.origineel.nummer}</Tekst>}
            {data.credits.map((c) => <Tekst key={c.id} kleur="2" soort="klein">Gecrediteerd met {c.nummer}</Tekst>)}
          </View>
        )}
        <View style={{ gap: 6, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          {f.regels.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: k.tekst, fontSize: 14, flex: 1 }}>{r.omschrijving}<Text style={{ color: k.tekst3 }}>  {r.aantal} {r.eenheid ?? ""} × {euro(r.prijs)}</Text></Text>
              <Text style={{ color: k.tekst, fontSize: 14, fontVariant: ["tabular-nums"] }}>{euro(r.aantal * r.prijs)}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 4, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          <Totaalregel label="Subtotaal" waarde={euro(f.subtotaal)} />
          <Totaalregel label="Btw" waarde={euro(f.btw)} />
          <Totaalregel label="Totaal" waarde={euro(f.totaal)} vet />
          {f.betaaldBedrag > 0 && f.status !== "betaald" && <Totaalregel label="Nog open" waarde={euro(data.open)} />}
        </View>
        {f.opmerking ? <Tekst kleur="2" soort="klein">{f.opmerking}</Tekst> : null}
      </Kaart>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Knop tekst="PDF" soort="licht" klein onPress={() => ga("/pdf", { pad: data.pdf, naam: `${f.nummer}.pdf`, titel })} />
        {f.status === "concept" && <Knop tekst="Bewerken" soort="licht" klein onPress={() => ga("/factuur/nieuw", { id: f.id })} />}
        {(f.status === "concept" || data.isOpen) && <Knop tekst={f.status === "concept" ? "Verzenden per e-mail" : "Opnieuw verzenden"} klein soort={f.status === "concept" ? "primair" : "licht"} bezig={bezig === "factuurVerzenden"} onPress={() => klant.email ? doe("factuurVerzenden", {}, "Factuur verzonden.") : setMelding({ soort: "fout", tekst: "De klant heeft nog geen e-mailadres." })} />}
        {data.isOpen && <Knop tekst="Herinnering sturen" soort="licht" klein bezig={bezig === "factuurHerinnering"} onPress={() => doe("factuurHerinnering")} />}
        {data.isOpen && <Knop tekst="Betaald gemeld" soort="licht" klein onPress={() => setBetaal(betaal ? null : { bedrag: String(data.open).replace(".", ","), datum: isoDatum() })} />}
        {data.isOpen && f.soort === "factuur" && <Knop tekst="iDEAL-link" soort="licht" klein bezig={bezig === "factuurBetaallink"} onPress={() => doe("factuurBetaallink")} />}
        {data.peppol && (f.status === "concept" || data.isOpen) && <Knop tekst="Via Peppol" soort="licht" klein bezig={bezig === "factuurPeppol"} onPress={() => doe("factuurPeppol")} />}
        {f.status !== "concept" && <Knop tekst="Link delen" soort="licht" klein onPress={() => Share.share({ message: `${titel} van ${klant.naam}: ${data.link}`, url: data.link })} />}
        {f.soort === "factuur" && f.status !== "concept" && f.status !== "gecrediteerd" && <Knop tekst="Crediteren" soort="licht" klein onPress={() => setCredit(credit == null ? "" : null)} />}
        {data.isOpen && <Knop tekst="Oninbaar" soort="licht" klein bezig={bezig === "factuurStatus"} onPress={() => Alert.alert("Oninbaar", "De factuur wordt afgeboekt als oninbaar.", [{ text: "Annuleren", style: "cancel" }, { text: "Oninbaar", style: "destructive", onPress: () => doe("factuurStatus", { status: "oninbaar" }) }])} />}
        {f.status === "concept" && <Knop tekst="Verwijderen" soort="rood" klein bezig={bezig === "factuurVerwijderen"} onPress={() => Alert.alert("Verwijderen", "Dit concept wordt verwijderd.", [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: () => doe("factuurVerwijderen") }])} />}
      </View>

      {betaal && (
        <Kaart titel="Betaling melden">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Bedrag" value={betaal.bedrag} onChangeText={(v) => setBetaal({ ...betaal, bedrag: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Veld label="Datum" value={betaal.datum} onChangeText={(v) => setBetaal({ ...betaal, datum: v })} /></View>
          </View>
          <Knop tekst="Markeer als betaald" bezig={bezig === "factuurBetaald"} onPress={async () => { await doe("factuurBetaald", { bedrag: betaal.bedrag, datum: betaal.datum }, "Betaling verwerkt."); setBetaal(null); }} />
        </Kaart>
      )}
      {credit != null && (
        <Kaart titel="Creditfactuur maken">
          <Tekst kleur="2" soort="klein">Dezelfde regels met negatieve aantallen; deze factuur krijgt de status gecrediteerd.</Tekst>
          <Veld label="Reden (komt op de creditfactuur)" value={credit} onChangeText={setCredit} />
          <Knop tekst="Maak creditfactuur" bezig={bezig === "factuurCrediteren"} onPress={() => doe("factuurCrediteren", { reden: credit })} />
        </Kaart>
      )}

      {data.kandidaten.length > 0 && (
        <Kaart titel="Betaling koppelen" strak>
          <Tekst kleur="2" soort="klein" style={{ padding: 12, paddingBottom: 4 }}>Deze bankregels lijken de betaling van deze factuur:</Tekst>
          {data.kandidaten.map((t, i) => <Rij key={t.id} titel={t.tegenpartij} sub={t.omschrijving} rechts={euro(t.bedrag)} rechtsSub={datumKort(t.datum)} onPress={() => doe("factuurAfletteren", { transactieId: t.id }, "Betaling aan de factuur gekoppeld.")} laatste={i === data.kandidaten.length - 1} />)}
        </Kaart>
      )}

      <Kaart titel="Tijdlijn" strak>
        {data.tijdlijn.map((t, i) => <Rij key={i} titel={t.tekst} rechts={datumKort(t.datum)} laatste={i === data.tijdlijn.length - 1} nummer={false} />)}
      </Kaart>
      <Knop tekst={`Klant ${klant.naam}`} soort="tekst" onPress={() => ga("/klant/[id]", { id: klant.id })} />
    </Scherm>
  );
}
