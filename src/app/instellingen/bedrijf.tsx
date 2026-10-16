import { useState } from "react";
import { View } from "react-native";
import { actie } from "@/lib/api";
import { useInstellingen } from "@/lib/instellingen";
import { useVervers } from "@/lib/queries";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Laden, Melding, Scherm, Veld } from "@/components/ui";

type Vorm = Record<"naam" | "branche" | "rechtsvorm" | "startdatum" | "kvk" | "btwId" | "btwNummer" | "iban" | "email" | "telefoon" | "website" | "adres" | "postcode" | "plaats" | "land", string>;

/** Bedrijfsgegevens, zoals op de tab Bedrijf in de webapp. Komen op je facturen. */
export default function Bedrijf() {
  const { data, refetch } = useInstellingen();
  const ververs = useVervers();
  const [vorm, setVorm] = useState<Vorm | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (data && !vorm) {
    const b = data.bedrijf;
    setVorm({ naam: b.naam, branche: b.branche ?? "", rechtsvorm: b.rechtsvorm, startdatum: b.startdatum ?? "", kvk: b.kvk ?? "", btwId: b.btwId ?? "", btwNummer: b.btwNummer ?? "", iban: b.iban ?? "", email: b.email ?? "", telefoon: b.telefoon ?? "", website: b.website ?? "", adres: b.adres ?? "", postcode: b.postcode ?? "", plaats: b.plaats ?? "", land: b.land });
  }
  if (!vorm) return <Scherm><Laden /></Scherm>;
  const zet = (deel: Partial<Vorm>) => setVorm({ ...vorm, ...deel });
  const doe = async (naam: string, velden: Record<string, string>, ok: string) => {
    setBezig(naam); setMelding(null);
    try { const r = await actie(naam, velden); setMelding(r.ok ? { soort: "ok", tekst: r.melding || ok } : { soort: "fout", tekst: r.fout }); if (r.ok) { await refetch(); setVorm(null); } await ververs("overzicht", "account"); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Opslaan lukte niet." }); }
    finally { setBezig(null); }
  };
  return (
    <Scherm>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Bedrijf">
        <Veld label="Bedrijfsnaam" value={vorm.naam} onChangeText={(v) => zet({ naam: v })} />
        <Veld label="Wat doe je?" value={vorm.branche} onChangeText={(v) => zet({ branche: v })} hint="Bijvoorbeeld webdesigner, fotograaf of webshop. Helpt Saldoplan bij het boeken." />
        <Kies label="Rechtsvorm" waarde={vorm.rechtsvorm} opties={[{ k: "eenmanszaak", l: "Eenmanszaak" }, { k: "vof", l: "Vof" }]} onChange={(v) => zet({ rechtsvorm: v })} />
        <Veld label="Gestart op" value={vorm.startdatum} onChangeText={(v) => zet({ startdatum: v })} placeholder="jjjj-mm-dd" />
      </Kaart>
      <Kaart titel="Nummers">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="KvK-nummer" value={vorm.kvk} onChangeText={(v) => zet({ kvk: v })} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Veld label="IBAN" value={vorm.iban} onChangeText={(v) => zet({ iban: v })} autoCapitalize="characters" hint="Komt op je facturen" /></View>
        </View>
        <Veld label="Btw-identificatienummer" value={vorm.btwId} onChangeText={(v) => zet({ btwId: v })} autoCapitalize="characters" hint="Begint met NL en eindigt op B01. Komt op je facturen." />
        <Veld label="Omzetbelastingnummer" value={vorm.btwNummer} onChangeText={(v) => zet({ btwNummer: v })} autoCapitalize="characters" hint="Voor de aangifte." />
        {vorm.kvk.length >= 8 && <Knop tekst="Gegevens ophalen bij de KvK" soort="licht" klein bezig={bezig === "bedrijfUitKvk"} onPress={() => doe("bedrijfUitKvk", {}, "Bijgewerkt uit het Handelsregister.")} />}
      </Kaart>
      <Kaart titel="Contact en adres">
        <Veld label="E-mail" value={vorm.email} onChangeText={(v) => zet({ email: v })} keyboardType="email-address" autoCapitalize="none" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Telefoon" value={vorm.telefoon} onChangeText={(v) => zet({ telefoon: v })} keyboardType="phone-pad" /></View>
          <View style={{ flex: 1 }}><Veld label="Website" value={vorm.website} onChangeText={(v) => zet({ website: v })} autoCapitalize="none" keyboardType="url" /></View>
        </View>
        <Veld label="Adres" value={vorm.adres} onChangeText={(v) => zet({ adres: v })} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Postcode" value={vorm.postcode} onChangeText={(v) => zet({ postcode: v })} /></View>
          <View style={{ flex: 2 }}><Veld label="Plaats" value={vorm.plaats} onChangeText={(v) => zet({ plaats: v })} /></View>
          <View style={{ flex: 1 }}><Veld label="Land" value={vorm.land} onChangeText={(v) => zet({ land: v.toUpperCase() })} maxLength={2} autoCapitalize="characters" /></View>
        </View>
      </Kaart>
      <Knop tekst="Opslaan" bezig={bezig === "bedrijfOpslaan"} onPress={() => doe("bedrijfOpslaan", vorm, "Bedrijfsgegevens opgeslagen.")} />
    </Scherm>
  );
}
