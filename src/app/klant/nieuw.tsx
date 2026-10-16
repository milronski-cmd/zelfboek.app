import { useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useMeta, useVervers } from "@/lib/queries";
import type { Klant } from "@/lib/types";
import { Kies } from "@/components/kies";
import { Chips, Kaart, Knop, Laden, Melding, Scherm, Veld } from "@/components/ui";

const LEEG = { naam: "", contactpersoon: "", email: "", telefoon: "", adres: "", postcode: "", plaats: "", land: "NL", kvk: "", btwNummer: "", isOndernemer: "ja", betaaltermijn: "", notities: "", taal: "" };

/** Klant toevoegen of bewerken (?id=), dezelfde velden als de webapp. */
export default function KlantNieuw() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const meta = useMeta();
  const ververs = useVervers();
  const bestaand = useQuery({ queryKey: ["klant", id], queryFn: () => api<{ klant: Klant }>(`/api/mobiel/klanten/${id}`), enabled: Boolean(id) });
  const [vorm, setVorm] = useState<typeof LEEG | null>(id ? null : LEEG);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  if (id && bestaand.data && !vorm) {
    const c = bestaand.data.klant;
    setVorm({ naam: c.naam, contactpersoon: c.contactpersoon ?? "", email: c.email ?? "", telefoon: c.telefoon ?? "", adres: c.adres ?? "", postcode: c.postcode ?? "", plaats: c.plaats ?? "", land: c.land, kvk: c.kvk ?? "", btwNummer: c.btwNummer ?? "", isOndernemer: c.isOndernemer ? "ja" : "nee", betaaltermijn: c.betaaltermijn ? String(c.betaaltermijn) : "", notities: c.notities ?? "", taal: c.taal });
  }
  if (!vorm) return <Scherm><Laden /></Scherm>;
  const zet = (deel: Partial<typeof LEEG>) => setVorm({ ...vorm, ...deel });
  const opslaan = async () => {
    setBezig(true); setFout(null);
    try {
      const r = await actie("klantOpslaan", { ...(id ? { id } : {}), ...vorm, isOndernemer_form: "1" });
      if (!r.ok) { setFout(r.fout); return; }
      await ververs("klanten", "klant");
      if (router.canGoBack()) router.back();
    } catch (e) { setFout(e instanceof Error ? e.message : "Opslaan lukte niet."); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      <Stack.Screen options={{ title: id ? "Klant bewerken" : "Nieuwe klant" }} />
      <Kaart titel="Klant">
        <Veld label="Naam (bedrijf of persoon)" value={vorm.naam} onChangeText={(v) => zet({ naam: v })} autoFocus={!id} />
        <Veld label="Contactpersoon" value={vorm.contactpersoon} onChangeText={(v) => zet({ contactpersoon: v })} />
        <Veld label="E-mail (voor facturen)" value={vorm.email} onChangeText={(v) => zet({ email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Veld label="Telefoon" value={vorm.telefoon} onChangeText={(v) => zet({ telefoon: v })} keyboardType="phone-pad" />
        <Chips label="Soort klant" opties={[{ k: "ja", l: "Ondernemer" }, { k: "nee", l: "Particulier" }]} waarde={vorm.isOndernemer} onChange={(v) => zet({ isOndernemer: v })} />
      </Kaart>
      <Kaart titel="Adres">
        <Veld label="Adres" value={vorm.adres} onChangeText={(v) => zet({ adres: v })} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Postcode" value={vorm.postcode} onChangeText={(v) => zet({ postcode: v })} /></View>
          <View style={{ flex: 2 }}><Veld label="Plaats" value={vorm.plaats} onChangeText={(v) => zet({ plaats: v })} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="Land" value={vorm.land} onChangeText={(v) => zet({ land: v.toUpperCase() })} autoCapitalize="characters" maxLength={2} hint="NL, DE, BE, ..." /></View>
          <View style={{ flex: 2 }}><Kies label="Taal van facturen" waarde={vorm.taal || null} opties={(meta.data?.talen ?? []).map((t) => ({ k: t.k, l: t.l }))} onChange={(v) => zet({ taal: v })} placeholder="Volgt het land" /></View>
        </View>
      </Kaart>
      <Kaart titel="Zakelijk">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Veld label="KvK-nummer" value={vorm.kvk} onChangeText={(v) => zet({ kvk: v })} keyboardType="number-pad" hint="Leeg adres vult Saldoplan aan uit de KvK" /></View>
          <View style={{ flex: 1 }}><Veld label="Btw-nummer" value={vorm.btwNummer} onChangeText={(v) => zet({ btwNummer: v })} autoCapitalize="characters" hint="EU-klant: btw verlegd" /></View>
        </View>
        <Veld label="Eigen betaaltermijn (dagen, mag leeg)" value={vorm.betaaltermijn} onChangeText={(v) => zet({ betaaltermijn: v })} keyboardType="number-pad" />
        <Veld label="Notities" value={vorm.notities} onChangeText={(v) => zet({ notities: v })} multiline />
      </Kaart>
      {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
      <Knop tekst="Opslaan" bezig={bezig} onPress={opslaan} disabled={!vorm.naam.trim()} />
    </Scherm>
  );
}
