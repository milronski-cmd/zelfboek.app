import { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie, BASIS, koppen } from "@/lib/api";
import { useMeta, useVervers } from "@/lib/queries";
import { euro, datumKort, datumNl } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import type { BonVol, Transactie } from "@/lib/types";
import { Kies } from "@/components/kies";
import { Fout, Kaart, Knop, Laden, Melding, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";
import { bonStatus } from "../(tabs)/bonnen";

type Detail = { bon: BonVol; transactie: Transactie | null; kandidaten: Transactie[]; bestand: string };

/** Eén bon: de foto, wat Saldoplan eruit las, corrigeren en koppelen aan de betaling. */
export default function BonDetail() {
  const k = useKleuren();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["bon", id], queryFn: () => api<Detail>(`/api/mobiel/bonnen/${id}`) });
  const meta = useMeta();
  const ververs = useVervers();
  const [bewerk, setBewerk] = useState(false);
  const [vorm, setVorm] = useState({ leverancier: "", factuurnummer: "", datum: "", totaal: "", btwBedrag: "", btwCode: "21", categorie: "" });
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const doe = async (naam: string, velden: Record<string, string> = {}, okTekst = "Opgeslagen.") => {
    setBezig(naam); setMelding(null);
    try {
      const r = await actie(naam, { id, ...velden });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding || okTekst } : { soort: "fout", tekst: r.fout });
      await Promise.all([refetch(), ververs("bonnen", "transacties", "overzicht")]);
      if (naam === "bonVerwijderen" && r.ok) router.back();
      if (r.ok) setBewerk(false);
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (error || !data) return <Scherm ververs={refetch}><Fout fout={error ?? "Niet gevonden"} opnieuw={refetch} /></Scherm>;
  const b = data.bon;
  const s = bonStatus(b);
  const isPdf = b.mimeType === "application/pdf";
  const start = () => { setVorm({ leverancier: b.leverancier ?? "", factuurnummer: b.factuurnummer ?? "", datum: b.datum ? b.datum.slice(0, 10) : "", totaal: b.totaal != null ? String(b.totaal).replace(".", ",") : "", btwBedrag: b.btwBedrag != null ? String(b.btwBedrag).replace(".", ",") : "", btwCode: b.btwCode ?? "21", categorie: b.categorie ?? "" }); setBewerk(true); };

  return (
    <Scherm ververs={refetch}>
      <Stack.Screen options={{ title: b.leverancier || "Bon" }} />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      {isPdf ? <Knop tekst="PDF bekijken" soort="licht" onPress={() => ga("/pdf", { pad: data.bestand, naam: b.bestandsnaam, titel: b.leverancier || "Bon" })} /> : (
        <Image source={{ uri: `${BASIS}${data.bestand}`, headers: koppen() }} style={{ width: "100%", height: 260, borderRadius: 8, backgroundColor: k.lijn }} resizeMode="contain" accessibilityLabel="Foto van de bon" />
      )}
      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: k.tekst, fontSize: 18, fontWeight: "700" }}>{b.leverancier || b.bestandsnaam}</Text>
            <Tekst kleur="2" soort="klein">{b.datum ? datumNl(b.datum) : "Datum onbekend"}{b.factuurnummer ? ` · ${b.factuurnummer}` : ""}</Tekst>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={{ color: k.tekst, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{b.totaal != null ? euro(b.totaal) : "–"}</Text>
            <Pil kleur={s.kleur}>{s.tekst}</Pil>
          </View>
        </View>
        {b.uitleg && <Tekst kleur="2" soort="klein">{b.uitleg}</Tekst>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {b.categorie && <Pil kleur="grijs">{meta.data?.categorieen.find((c) => c.k === b.categorie)?.label ?? b.categorie}</Pil>}
          {b.btwCode && <Pil kleur="grijs">{meta.data?.btwCodes.find((c) => c.k === b.btwCode)?.label ?? b.btwCode}</Pil>}
          {b.btwBedrag != null && <Pil kleur="grijs">btw {euro(b.btwBedrag)}</Pil>}
          {b.leverancierBtw && <Pil kleur="grijs">{b.leverancierBtw}</Pil>}
        </View>
        {b.regels.length > 0 && (
          <View style={{ gap: 4, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 8 }}>
            {b.regels.map((r, i) => <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: k.tekst2, fontSize: 13, flex: 1 }}>{r.omschrijving}</Text><Text style={{ color: k.tekst, fontSize: 13, fontVariant: ["tabular-nums"] }}>{euro(r.bedrag)}</Text></View>)}
          </View>
        )}
        <Tekst kleur="3" soort="klein">Toegevoegd {datumKort(b.aangemaakt)} via {b.bron === "app" ? "de app" : b.bron === "mail" ? "e-mail" : b.bron}.</Tekst>
      </Kaart>

      {bewerk ? (
        <Kaart titel="Gegevens corrigeren">
          <Veld label="Leverancier" value={vorm.leverancier} onChangeText={(v) => setVorm({ ...vorm, leverancier: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Datum" value={vorm.datum} onChangeText={(v) => setVorm({ ...vorm, datum: v })} placeholder="jjjj-mm-dd" /></View>
            <View style={{ flex: 1 }}><Veld label="Factuurnummer" value={vorm.factuurnummer} onChangeText={(v) => setVorm({ ...vorm, factuurnummer: v })} /></View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Totaal incl. btw" value={vorm.totaal} onChangeText={(v) => setVorm({ ...vorm, totaal: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Veld label="Btw-bedrag" value={vorm.btwBedrag} onChangeText={(v) => setVorm({ ...vorm, btwBedrag: v })} keyboardType="decimal-pad" hint="Leeg = berekend" /></View>
          </View>
          <Kies label="Btw-code" waarde={vorm.btwCode} opties={(meta.data?.btwCodes ?? []).map((c) => ({ k: c.k, l: c.label }))} onChange={(v) => setVorm({ ...vorm, btwCode: v })} />
          <Kies label="Categorie" waarde={vorm.categorie || null} opties={(meta.data?.categorieen ?? []).map((c) => ({ k: c.k, l: c.label }))} onChange={(v) => setVorm({ ...vorm, categorie: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setBewerk(false)} />
            <Knop tekst="Opslaan" style={{ flex: 1 }} bezig={bezig === "bonWijzigen"} onPress={() => doe("bonWijzigen", vorm)} />
          </View>
        </Kaart>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Knop tekst="Corrigeren" soort="licht" klein onPress={start} />
          <Knop tekst="Opnieuw lezen" soort="licht" klein bezig={bezig === "bonOpnieuwLezen"} onPress={() => doe("bonOpnieuwLezen", {}, "Saldoplan leest de bon opnieuw.")} />
          {data.transactie && <Knop tekst="Ontkoppelen" soort="licht" klein bezig={bezig === "bonOntkoppelen"} onPress={() => doe("bonOntkoppelen", {}, "Bon losgekoppeld.")} />}
          <Knop tekst="Verwijderen" soort="rood" klein onPress={() => Alert.alert("Verwijderen", "De bon wordt verwijderd.", [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: () => doe("bonVerwijderen") }])} />
        </View>
      )}

      {data.transactie ? (
        <Kaart titel="Hoort bij deze betaling" strak><Rij titel={data.transactie.tegenpartij} sub={data.transactie.omschrijving} rechts={euro(data.transactie.bedrag)} rechtsSub={datumKort(data.transactie.datum)} onPress={() => ga("/transactie/[id]", { id: data.transactie!.id })} laatste /></Kaart>
      ) : data.kandidaten.length > 0 ? (
        <Kaart titel="Koppelen aan een betaling" strak>
          <Tekst kleur="2" soort="klein" style={{ padding: 12, paddingBottom: 4 }}>Betalingen rond de datum van de bon, zonder bon:</Tekst>
          {data.kandidaten.map((t, i) => <Rij key={t.id} titel={t.tegenpartij} sub={t.omschrijving} rechts={euro(t.bedrag)} rechtsSub={datumKort(t.datum)} onPress={() => doe("bonKoppelen", { transactieId: t.id }, "Bon aan de betaling gekoppeld.")} laatste={i === data.kandidaten.length - 1} />)}
        </Kaart>
      ) : b.status !== "gekoppeld" ? <Tekst kleur="3" soort="klein" style={{ textAlign: "center" }}>Nog geen betaling gevonden die hierbij hoort. Zodra die binnenkomt, koppelt Saldoplan hem vanzelf.</Tekst> : null}
    </Scherm>
  );
}
