import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useMeta, useVervers } from "@/lib/queries";
import { euro, datumNl } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import type { Bon, Transactie } from "@/lib/types";
import { Kies } from "@/components/kies";
import { Chips, Fout, Kaart, Knop, Laden, Melding, Pil, Rij, Scherm, Schakel, Tekst, Veld, useKleuren } from "@/components/ui";
import { Acties } from "@/components/acties";
import { statusVan } from "../(tabs)/bank";

type Detail = { regel: Transactie; bon: Bon | null; openFacturen: { id: string; nummer: string; klant: string; open: number }[] };

/** Eén betaling: wat Saldoplan ervan maakte en waarom, en zelf anders boeken (categorie, btw, privédeel, splitsen). */
export default function TransactieDetail() {
  const k = useKleuren();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["transactie", id], queryFn: () => api<Detail>(`/api/mobiel/transacties/${id}`) });
  const meta = useMeta();
  const ververs = useVervers();
  const [bewerk, setBewerk] = useState(false);
  const [vorm, setVorm] = useState<{ zakelijk: "ja" | "nee"; categorie: string; btwCode: string; priveDeel: string; splitsBedrag: string; opmerking: string; altijd: boolean } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);

  const doe = async (naam: string, velden: Record<string, string | undefined> = {}, okTekst = "Opgeslagen.") => {
    setBezig(naam); setMelding(null);
    try {
      const r = await actie(naam, { id, ...velden });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding || okTekst } : { soort: "fout", tekst: r.fout });
      await Promise.all([refetch(), ververs("transacties", "overzicht", "vragen", "bonnen", "facturen", "activa")]);
      if (naam === "verwijderTransactie" && r.ok) router.back();
      if (r.ok) setBewerk(false);
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (error || !data) return <Scherm ververs={refetch}><Fout fout={error ?? "Niet gevonden"} opnieuw={refetch} /></Scherm>;
  const t = data.regel;
  const s = statusVan(t);
  const start = () => { setVorm({ zakelijk: t.zakelijk === false ? "nee" : "ja", categorie: t.categorie ?? "overig", btwCode: t.btwCode ?? "21", priveDeel: String(Math.round(t.priveDeel * 100)), splitsBedrag: "", opmerking: t.opmerking ?? "", altijd: false }); setBewerk(true); };
  /** Van privé naar zakelijk: categorie "prive" en btw "geen" horen bij privé en gaan naar een zakelijk beginpunt (aan te passen). */
  const kiesZakelijk = (v: "ja" | "nee") => vorm && setVorm(v === "ja" ? { ...vorm, zakelijk: v, categorie: vorm.categorie === "prive" ? "overig" : vorm.categorie, btwCode: vorm.btwCode === "geen" ? "21" : vorm.btwCode } : { ...vorm, zakelijk: v });
  const categorieLabel = meta.data?.categorieen.find((c) => c.k === t.categorie)?.label ?? t.categorie ?? "–";

  return (
    <Scherm ververs={refetch}>
      <Stack.Screen options={{ title: t.tegenpartij }} />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: k.tekst, fontSize: 18, fontWeight: "700" }}>{t.tegenpartij}</Text>
            <Tekst kleur="2" soort="klein">{datumNl(t.datum)}{t.rekening ? ` · ${t.rekening}` : ""}{t.bron && t.bron !== "psd2" && t.bron !== "upload" ? ` · ${t.bron}` : ""}</Tekst>
          </View>
          <Text style={{ color: t.bedrag > 0 ? k.groenTekst : k.tekst, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{euro(t.bedrag)}</Text>
        </View>
        <Tekst kleur="2" soort="klein">{t.omschrijving}</Tekst>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Pil kleur={s.kleur}>{s.tekst}</Pil>
          {t.zakelijk && <Pil kleur="grijs">{categorieLabel}</Pil>}
          {t.zakelijk && t.btwCode && <Pil kleur="grijs">{meta.data?.btwCodes.find((b) => b.k === t.btwCode)?.label ?? t.btwCode}</Pil>}
          {t.priveDeel > 0 && <Pil kleur="grijs">{Math.round(t.priveDeel * 100)}% privé</Pil>}
        </View>
        {t.uitleg && <Tekst kleur="2" soort="klein">{t.uitleg}{t.zekerheid != null && t.zekerheid < 1 ? ` (${Math.round(t.zekerheid * 100)}% zeker)` : ""}</Tekst>}
        {t.btwBedrag != null && t.zakelijk && <Tekst kleur="3" soort="klein">Btw in dit bedrag: {euro(t.btwBedrag)}</Tekst>}
        {t.opmerking && <Tekst kleur="2" soort="klein">Opmerking: {t.opmerking}</Tekst>}
      </Kaart>

      {!bewerk && t.zakelijk !== null && !t.bevestigd && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Knop tekst="Zakelijk, klopt" style={{ flex: 1 }} bezig={bezig === "zakelijk"} onPress={() => doe("beantwoordVraag", { ids: t.id, keuze: "zakelijk" }, "Geboekt als zakelijk.")} />
          <Knop tekst="Privé" soort="licht" style={{ flex: 1 }} bezig={bezig === "prive"} onPress={() => doe("beantwoordVraag", { ids: t.id, keuze: "prive" }, "Gemarkeerd als privé.")} />
        </View>
      )}
      {!bewerk && <Knop tekst="Anders boeken" soort={t.zakelijk === null ? "primair" : "licht"} onPress={start} />}

      {bewerk && vorm && (
        <Kaart titel="Anders boeken">
          <Chips label="Zakelijk of privé" opties={[{ k: "ja", l: "Zakelijk" }, { k: "nee", l: "Privé" }]} waarde={vorm.zakelijk} onChange={kiesZakelijk} />
          {vorm.zakelijk === "ja" && (
            <>
              <Kies label="Categorie" waarde={vorm.categorie} opties={(meta.data?.categorieen ?? []).map((c) => ({ k: c.k, l: c.label }))} onChange={(v) => setVorm({ ...vorm, categorie: v })} />
              <Kies label="Btw" waarde={vorm.btwCode} opties={(meta.data?.btwCodes ?? []).map((b) => ({ k: b.k, l: b.label }))} onChange={(v) => setVorm({ ...vorm, btwCode: v })} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Veld label="Privédeel (%)" value={vorm.priveDeel} onChangeText={(v) => setVorm({ ...vorm, priveDeel: v })} keyboardType="number-pad" hint="Gemengde kosten, bijvoorbeeld 30" /></View>
                <View style={{ flex: 1 }}><Veld label="Splits af als privé (€)" value={vorm.splitsBedrag} onChangeText={(v) => setVorm({ ...vorm, splitsBedrag: v })} keyboardType="decimal-pad" hint="Wordt een aparte privéregel" /></View>
              </View>
            </>
          )}
          <Veld label="Opmerking voor jezelf of je boekhouder" value={vorm.opmerking} onChangeText={(v) => setVorm({ ...vorm, opmerking: v })} />
          <Schakel label={`Altijd zo boeken bij ${t.tegenpartij}`} uitleg="Ook de volgende betalingen aan deze partij." aan={vorm.altijd} onChange={(v) => setVorm({ ...vorm, altijd: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setBewerk(false)} />
            <Knop tekst="Opslaan" style={{ flex: 1 }} bezig={bezig === "wijzigTransactie"} onPress={() => doe("wijzigTransactie", { zakelijk: vorm.zakelijk, categorie: vorm.categorie, btwCode: vorm.btwCode, priveDeel: vorm.priveDeel, splitsBedrag: vorm.splitsBedrag, opmerking: vorm.opmerking, altijd: vorm.altijd ? "1" : undefined })} />
          </View>
        </Kaart>
      )}

      {data.bon ? (
        <Kaart titel="Bon" strak><Rij titel={data.bon.leverancier || data.bon.bestandsnaam} sub={data.bon.uitleg} rechts={data.bon.totaal != null ? euro(data.bon.totaal) : ""} onPress={() => ga("/bon/[id]", { id: data.bon!.id })} laatste /></Kaart>
      ) : null}
      {data.openFacturen.length > 0 && (
        <Kaart titel="Is dit de betaling van een factuur?" strak>
          {data.openFacturen.map((f, i) => <Rij key={f.id} titel={`${f.klant} · ${f.nummer}`} rechts={euro(f.open)} rechtsSub="open" onPress={() => doe("factuurAfletteren", { id: f.id, transactieId: t.id }, "Betaling aan de factuur gekoppeld.")} laatste={i === data.openFacturen.length - 1} />)}
        </Kaart>
      )}
      <Acties acties={[
        !data.bon && t.bedrag < 0 && t.zakelijk && { tekst: "Bon toevoegen", sf: "camera", onPress: () => ga("/(tabs)/bonnen") },
        Boolean(t.factuurId) && { tekst: `Factuur ${t.factuurNummer ?? ""}`.trim(), sf: "doc.text" as const, onPress: () => ga("/factuur/[id]", { id: t.factuurId! }) },
        t.bedrag < -450 * 1.21 && t.zakelijk && !t.activumId && { tekst: "Grote aankoop", sf: "laptopcomputer", bezig: bezig === "boekAlsInvestering", onPress: () => Alert.alert("Grote aankoop", "Deze betaling wordt een bedrijfsmiddel dat je in 5 jaar afschrijft.", [{ text: "Annuleren", style: "cancel" }, { text: "Boek als aankoop", onPress: () => doe("boekAlsInvestering", { transactieId: t.id }, "Geboekt als grote aankoop.") }]) },
        t.bron !== "psd2" && { tekst: "Verwijderen", sf: "trash", soort: "gevaar", onPress: () => Alert.alert("Verwijderen", "Deze bankregel wordt verwijderd uit je boekhouding.", [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: () => doe("verwijderTransactie") }]) },
      ]} />
    </Scherm>
  );
}
