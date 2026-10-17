import { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, wanneerNl } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

type K = { status: string; naam: string | null; laatsteSync: string | null; laatsteFout: string | null; proef: boolean } | null;
type Antwoord = {
  bank: { klaar: boolean; koppeling: K; rekeningen: { id: string; naam: string; iban: string; bank: string | null; psd2Verloopt: string | null; laatsteSync: string | null; saldo: number | null }[] };
  aanbieders: { soort: string; naam: string; vraagtAdres: { label: string; voorbeeld: string } | null; kan: boolean; koppeling: K }[];
  overig: { soort: string; koppeling: K }[]; bonAdres: string; whatsapp: string; proefmodus: boolean;
};
const BANKEN = [{ k: "ing", l: "ING" }, { k: "rabobank", l: "Rabobank" }, { k: "abnamro", l: "ABN AMRO" }, { k: "bunq", l: "bunq" }, { k: "knab", l: "Knab" }, { k: "sns", l: "SNS" }, { k: "asn", l: "ASN" }, { k: "regiobank", l: "RegioBank" }, { k: "triodos", l: "Triodos" }, { k: "revolut", l: "Revolut" }, { k: "n26", l: "N26" }];

const statusPil = (x: K) => !x ? null : x.status === "actief" ? <Pil kleur="groen">{x.proef ? "Gekoppeld (proef)" : "Gekoppeld"}</Pil> : <Pil kleur={x.status === "uitgeschakeld" ? "grijs" : "rood"}>{x.status === "uitgeschakeld" ? "Uit" : x.status === "verlopen" ? "Opnieuw koppelen" : "Werkt niet"}</Pil>;

/** Koppelingen: bank (PSD2), verkoopkanalen, mail en WhatsApp voor bonnen. Inloggen bij de partij gebeurt in de browser. */
export default function Koppelingen() {
  const k = useKleuren();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["koppelingen"], queryFn: () => api<Antwoord>("/api/mobiel/koppelingen") });
  const ververs = useVervers();
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const [bank, setBank] = useState("ing");
  const [adres, setAdres] = useState<Record<string, string>>({});
  const na = async () => { await Promise.all([refetch(), ververs("overzicht", "transacties", "rekeningen")]); };
  const start = async (naam: string, velden: Record<string, string>, sleutel: string) => {
    setBezig(sleutel); setMelding(null);
    try {
      const r = await actie(naam, velden);
      if (!r.ok) { setMelding({ soort: "fout", tekst: r.fout }); return; }
      if (r.naar && /^https?:\/\//.test(r.naar)) {
        await WebBrowser.openAuthSessionAsync(r.naar, "saldoplan://");
        setMelding({ soort: "ok", tekst: "Terug uit de browser. Trek omlaag om de status te verversen." });
      } else if (r.naar?.includes("/koppelingen/proef")) {
        await WebBrowser.openAuthSessionAsync(`${(await api<{ appUrl: string }>("/api/mobiel/meta")).appUrl}${r.naar}`, "saldoplan://");
      } else setMelding({ soort: "ok", tekst: r.melding || "Gedaan." });
      await na();
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  const ontkoppel = (soort: string, naam: string) => Alert.alert("Ontkoppelen", `${naam} wordt losgekoppeld. Wat al is opgehaald blijft staan.`, [{ text: "Annuleren", style: "cancel" }, { text: "Ontkoppelen", style: "destructive", onPress: () => start("koppelingVerwijderen", { soort }, soort) }]);
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  const psd2 = data.bank.koppeling;
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Koppelingen" sub="Alles wat geld binnenbrengt op één plek. Je logt in bij de partij zelf; Saldoplan kan nooit overmaken." />
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      {data.proefmodus && <Melding soort="info" tekst="Proefmodus: koppelingen leveren voorbeeldgegevens, er wordt niets echt opgehaald." />}

      <Kaart titel="Bank" actie={statusPil(psd2)}>
        {psd2 ? (
          <>
            {data.bank.rekeningen.map((r) => <Rij key={r.id} titel={r.naam} sub={`${r.iban}${r.psd2Verloopt ? ` · toestemming tot ${new Date(r.psd2Verloopt).toLocaleDateString("nl-NL")}` : ""}`} rechts={r.saldo != null ? euro(r.saldo) : ""} laatste />)}
            {psd2.laatsteSync && <Tekst kleur="3" soort="klein">Laatst opgehaald {wanneerNl(psd2.laatsteSync)}. Daarna elke nacht vanzelf.</Tekst>}
            {psd2.laatsteFout && <Tekst soort="klein" style={{ color: k.roodTekst }}>{psd2.laatsteFout}</Tekst>}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Knop tekst="Nu ophalen" klein bezig={bezig === "sync-enablebanking"} onPress={() => start("syncNu", { soort: "enablebanking" }, "sync-enablebanking")} />
              <Knop tekst="Rekening toevoegen" klein soort="licht" bezig={bezig === "psd2"} onPress={() => start("startPsd2", { bank }, "psd2")} />
              <Knop tekst="Ontkoppelen" klein soort="tekst" onPress={() => ontkoppel("enablebanking", "je bank")} />
            </View>
          </>
        ) : data.bank.klaar ? (
          <>
            <Tekst kleur="2" soort="klein">Kies je bank en log in. Daarna haalt Saldoplan elke nacht je betalingen op.</Tekst>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {BANKEN.map((b) => <Knop key={b.k} tekst={b.l} klein soort={bank === b.k ? "primair" : "licht"} onPress={() => setBank(b.k)} />)}
            </View>
            <Knop tekst={`Koppel ${BANKEN.find((b) => b.k === bank)?.l}`} bezig={bezig === "psd2"} onPress={() => start("startPsd2", { bank }, "psd2")} />
            <Knop tekst="Of lees een bankbestand in (CSV, MT940, CAMT)" soort="tekst" klein onPress={() => ga("/(tabs)/bank")} />
          </>
        ) : <Tekst kleur="2" soort="klein">De bankkoppeling staat binnenkort aan. Tot die tijd lees je een bankbestand in onder Bank.</Tekst>}
      </Kaart>

      <Kaart titel="Bonnen per e-mail en WhatsApp">
        <Tekst kleur="2" soort="klein">Stuur bonnen door naar dit adres, dan leest Saldoplan ze vanzelf:</Tekst>
        <Text selectable style={{ color: k.tekst, fontSize: 13, fontWeight: "600" }}>{data.bonAdres}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Knop tekst="Adres delen" klein soort="licht" onPress={() => Share.share({ message: data.bonAdres })} />
          <Knop tekst="WhatsApp koppelen" klein soort="licht" onPress={() => Alert.alert("WhatsApp", `Stuur dit bericht naar het Saldoplan-nummer (zie de webapp onder Koppelingen):\n\n${data.whatsapp}`, [{ text: "Kopieer bericht", onPress: () => Share.share({ message: data.whatsapp }) }, { text: "Sluiten", style: "cancel" }])} />
        </View>
      </Kaart>

      <Kaart titel="Verkoopkanalen en boekhoudpakketten" strak>
        {data.aanbieders.map((a, i) => {
          const kk = a.koppeling;
          return (
            <View key={a.soort} style={{ padding: 14, gap: 8, borderBottomWidth: i < data.aanbieders.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>{a.naam}{kk?.naam ? <Text style={{ color: k.tekst3, fontWeight: "400" }}>  {kk.naam}</Text> : null}</Text>
                {kk ? statusPil(kk) : !a.kan ? <Pil kleur="grijs">Binnenkort</Pil> : null}
              </View>
              {kk ? (
                <>
                  {kk.laatsteSync && <Tekst kleur="3" soort="klein">Laatst opgehaald {wanneerNl(kk.laatsteSync)}.</Tekst>}
                  {kk.laatsteFout && <Tekst soort="klein" style={{ color: k.roodTekst }}>{kk.laatsteFout}</Tekst>}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {a.soort !== "moneybird" && <Knop tekst="Nu ophalen" klein soort="licht" bezig={bezig === `sync-${a.soort}`} onPress={() => start("syncNu", { soort: a.soort }, `sync-${a.soort}`)} />}
                    {a.soort === "moneybird" && <Knop tekst="Gegevens overnemen" klein onPress={() => ga("/importeren")} />}
                    <Knop tekst="Ontkoppelen" klein soort="tekst" onPress={() => ontkoppel(a.soort, a.naam)} />
                  </View>
                </>
              ) : a.kan ? (
                <>
                  {a.vraagtAdres && <Veld label={a.vraagtAdres.label} placeholder={a.vraagtAdres.voorbeeld} value={adres[a.soort] ?? ""} onChangeText={(v) => setAdres({ ...adres, [a.soort]: v })} autoCapitalize="none" keyboardType="url" />}
                  <Knop tekst={`Koppel ${a.naam}`} klein soort="licht" bezig={bezig === a.soort} disabled={Boolean(a.vraagtAdres) && !adres[a.soort]} onPress={() => start("startKoppeling", { soort: a.soort, adres: adres[a.soort] ?? "" }, a.soort)} />
                </>
              ) : <Tekst kleur="3" soort="klein">Deze koppeling staat binnenkort aan.</Tekst>}
            </View>
          );
        })}
      </Kaart>
      <Tekst kleur="3" soort="klein" style={{ textAlign: "center" }}>bol.com, PayPal en koppelingen met een sleutel stel je in via de webapp onder Koppelingen.</Tekst>
    </Scherm>
  );
}
