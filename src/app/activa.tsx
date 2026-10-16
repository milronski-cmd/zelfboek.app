import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumKort, datumNl, isoDatum } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import type { Transactie } from "@/lib/types";
import { Kies } from "@/components/kies";
import { Cijferband, Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tegel, Tekst, Veld, useKleuren } from "@/components/ui";

type Activum = { id: string; naam: string; categorie: string; aanschafDatum: string; aanschafBedrag: number; restwaarde: number; looptijdJaren: number; kiaToegepast: boolean; priveDeel: number; verkochtOp: string | null; verkoopBedrag: number | null; boekwaarde: number; boekresultaat: number | null; schema: { jaar: number; afschrijving: number; boekwaarde: number }[] };
type Antwoord = { grens: number; kia: number; investeringenDitJaar: number; totaalBoekwaarde: number; afschrijvingJaar: number; activa: Activum[]; kandidaten: Transactie[] };
const CATEGORIEEN = [{ k: "inventaris", l: "Inventaris" }, { k: "computer", l: "Computer en apparatuur" }, { k: "machine", l: "Machine of gereedschap" }, { k: "vervoer", l: "Vervoermiddel" }, { k: "verbouwing", l: "Verbouwing" }, { k: "overig", l: "Overig" }];

/** Grote aankopen: activeren, afschrijven, investeringsaftrek, verkopen. */
export default function Activa() {
  const k = useKleuren();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["activa"], queryFn: () => api<Antwoord>("/api/mobiel/activa") });
  const ververs = useVervers();
  const [open, setOpen] = useState(false);
  const [gekozen, setGekozen] = useState<Activum | null>(null);
  const [verkoop, setVerkoop] = useState({ verkochtOp: isoDatum(), verkoopBedrag: "" });
  const [vorm, setVorm] = useState({ naam: "", categorie: "inventaris", aanschafDatum: isoDatum(), aanschafBedrag: "", restwaarde: "0", looptijdJaren: "5", priveDeel: "0", transactieId: "" });
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const na = async () => { await Promise.all([refetch(), ververs("activa", "transacties", "jaarrekening", "ib")]); };
  const doe = async (naam: string, velden: Record<string, string>, ok = "Opgeslagen.") => {
    setBezig(naam); setMelding(null);
    try { const r = await actie(naam, velden); setMelding(r.ok ? { soort: "ok", tekst: r.melding || ok } : { soort: "fout", tekst: r.fout }); if (r.ok) { setOpen(false); setGekozen(null); } await na(); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  const jaar = new Date().getFullYear();
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Grote aankopen" sub={`Koop je iets van € ${data.grens} of meer (zonder btw), dan tellen de kosten verspreid over een paar jaar mee. Saldoplan regelt dat elke maand zelf.`}>
        <Knop tekst="Afschrijvingen bijwerken" soort="licht" klein bezig={bezig === "afschrijvingenBijwerken"} onPress={() => doe("afschrijvingenBijwerken", {}, "Afschrijvingen bijgewerkt.")} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Cijferband>
        <Tegel label="Waarde nu" waarde={euro(data.totaalBoekwaarde)} hint={`${data.activa.filter((a) => !a.verkochtOp).length} in gebruik`} />
        <Tegel label={`Kosten in ${jaar}`} waarde={euro(data.afschrijvingJaar)} hint="het deel dat dit jaar meetelt" />
        <Tegel label={`Investeringsaftrek ${jaar}`} waarde={euro(data.kia)} accent={data.kia > 0 ? "groen" : undefined} hint={data.investeringenDitJaar > 0 && data.kia === 0 ? `${euro(data.investeringenDitJaar)} geïnvesteerd, drempel nog niet gehaald` : `${euro(data.investeringenDitJaar)} geïnvesteerd`} />
      </Cijferband>

      {data.kandidaten.length > 0 && (
        <Kaart titel="Zijn dit grote aankopen?" strak>
          <Tekst kleur="2" soort="klein" style={{ padding: 12, paddingBottom: 4 }}>Betalingen van € {data.grens} of meer die nog niet als bedrijfsmiddel staan:</Tekst>
          {data.kandidaten.map((t, i) => <Rij key={t.id} titel={t.tegenpartij} sub={t.omschrijving} rechts={euro(t.bedrag)} rechtsSub={datumKort(t.datum)} onPress={() => Alert.alert("Grote aankoop", `${t.tegenpartij} ${euro(t.bedrag)} activeren en in 5 jaar afschrijven?`, [{ text: "Annuleren", style: "cancel" }, { text: "Ja, activeren", onPress: () => doe("boekAlsInvestering", { transactieId: t.id }, "Geboekt als grote aankoop.") }])} laatste={i === data.kandidaten.length - 1} />)}
        </Kaart>
      )}

      {open ? (
        <Kaart titel="Aankoop toevoegen">
          <Veld label="Wat" value={vorm.naam} onChangeText={(v) => setVorm({ ...vorm, naam: v })} placeholder="MacBook Pro" autoFocus />
          <Kies label="Soort" waarde={vorm.categorie} opties={CATEGORIEEN} onChange={(v) => setVorm({ ...vorm, categorie: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Gekocht op" value={vorm.aanschafDatum} onChangeText={(v) => setVorm({ ...vorm, aanschafDatum: v })} /></View>
            <View style={{ flex: 1 }}><Veld label="Bedrag excl. btw" value={vorm.aanschafBedrag} onChangeText={(v) => setVorm({ ...vorm, aanschafBedrag: v })} keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Restwaarde" value={vorm.restwaarde} onChangeText={(v) => setVorm({ ...vorm, restwaarde: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Veld label="Jaren (min. 5)" value={vorm.looptijdJaren} onChangeText={(v) => setVorm({ ...vorm, looptijdJaren: v })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Veld label="Privé %" value={vorm.priveDeel} onChangeText={(v) => setVorm({ ...vorm, priveDeel: v })} keyboardType="number-pad" /></View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Knop tekst="Annuleren" soort="licht" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Knop tekst="Toevoegen" style={{ flex: 1 }} bezig={bezig === "activumToevoegen"} disabled={!vorm.naam || !vorm.aanschafBedrag} onPress={() => doe("activumToevoegen", vorm, "Aankoop toegevoegd.")} />
          </View>
        </Kaart>
      ) : <Knop tekst="Aankoop toevoegen" onPress={() => setOpen(true)} />}

      <Kaart titel="Bedrijfsmiddelen" strak>
        {data.activa.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12 }}>Nog geen grote aankopen.</Tekst>}
        {data.activa.map((a, i) => <Rij key={a.id} titel={a.naam} sub={`${datumKort(a.aanschafDatum)} · ${euro(a.aanschafBedrag)} · ${a.looptijdJaren} jaar${a.priveDeel ? ` · ${Math.round(a.priveDeel * 100)}% privé` : ""}`} rechts={a.verkochtOp ? euro(a.verkoopBedrag ?? 0) : euro(a.boekwaarde)} rechtsSub={a.verkochtOp ? "verkocht" : "waarde nu"} links={a.verkochtOp ? <Pil kleur="grijs">verkocht</Pil> : a.kiaToegepast ? <Pil kleur="groen">KIA</Pil> : undefined} onPress={() => setGekozen(gekozen?.id === a.id ? null : a)} laatste={i === data.activa.length - 1} />)}
      </Kaart>

      {gekozen && (
        <Kaart titel={gekozen.naam}>
          <View style={{ gap: 3 }}>
            {gekozen.schema.map((s) => <View key={s.jaar} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: k.tekst2, fontSize: 13 }}>{s.jaar}</Text><Text style={{ color: k.tekst, fontSize: 13, fontVariant: ["tabular-nums"] }}>afschrijving {euro(s.afschrijving)} · waarde {euro(s.boekwaarde)}</Text></View>)}
          </View>
          {gekozen.boekresultaat != null && <Tekst kleur="2" soort="klein">Boekresultaat bij verkoop: {euro(gekozen.boekresultaat)}</Tekst>}
          {!gekozen.verkochtOp && (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Veld label="Verkocht op" value={verkoop.verkochtOp} onChangeText={(v) => setVerkoop({ ...verkoop, verkochtOp: v })} /></View>
                <View style={{ flex: 1 }}><Veld label="Voor (excl. btw)" value={verkoop.verkoopBedrag} onChangeText={(v) => setVerkoop({ ...verkoop, verkoopBedrag: v })} keyboardType="decimal-pad" /></View>
              </View>
              <Knop tekst="Verkocht melden" soort="licht" bezig={bezig === "activumVerkopen"} onPress={() => doe("activumVerkopen", { id: gekozen.id, ...verkoop }, `${gekozen.naam} staat als verkocht op ${datumNl(verkoop.verkochtOp)}.`)} />
            </>
          )}
          <Knop tekst="Verwijderen" soort="tekst" onPress={() => Alert.alert("Verwijderen", `${gekozen.naam} en de afschrijvingen worden verwijderd.`, [{ text: "Annuleren", style: "cancel" }, { text: "Verwijderen", style: "destructive", onPress: () => doe("activumVerwijderen", { id: gekozen.id }, "Verwijderd.") }])} />
        </Kaart>
      )}
      <Knop tekst="Bankregels bekijken" soort="tekst" onPress={() => ga("/(tabs)/bank")} />
    </Scherm>
  );
}
