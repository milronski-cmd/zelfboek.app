import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { Symbool } from "@/components/symbool";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAccount, useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Kop, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

/** Wat je het vaakst nodig hebt: groot bovenaan. */
const VAAK: { pad: string; sf: SFSymbol; titel: string }[] = [
  { pad: "/klanten", sf: "person.2", titel: "Klanten" },
  { pad: "/offertes", sf: "doc.plaintext", titel: "Offertes" },
  { pad: "/btw", sf: "percent", titel: "Btw" },
  { pad: "/uren", sf: "clock", titel: "Uren" },
  { pad: "/kilometers", sf: "car", titel: "Ritten" },
  { pad: "/zoeken", sf: "magnifyingglass", titel: "Zoeken" },
];

/** Alle onderdelen, in gewone taal. Niets is weggelaten: dit is dezelfde boekhouding als op de website. */
const GROEPEN: { kop: string; items: { pad: string; titel: string; sub: string; woorden?: string }[] }[] = [
  { kop: "Geld ontvangen", items: [
    { pad: "/klanten", titel: "Klanten", sub: "Wie je klanten zijn en wie nog moet betalen", woorden: "klant debiteur relatie adres" },
    { pad: "/offertes", titel: "Offertes", sub: "Prijsvoorstel sturen, klant tekent online", woorden: "offerte prijsopgave tekenen" },
    { pad: "/producten", titel: "Producten en diensten", sub: "Wat je verkoopt, met je vaste prijzen", woorden: "product dienst tarief prijslijst" },
    { pad: "/terugkerend", titel: "Elke maand dezelfde factuur", sub: "Voor abonnementen en vaste klanten", woorden: "abonnement herhalen terugkerend vaste facturen" },
    { pad: "/uren", titel: "Uren", sub: "Je gewerkte uren bijhouden en factureren", woorden: "urenregistratie urencriterium declarabel agenda" },
    { pad: "/kilometers", titel: "Zakelijke ritten", sub: "Kilometers met je eigen auto of fiets", woorden: "rit reiskosten auto fiets kilometers" },
  ] },
  { kop: "Belasting", items: [
    { pad: "/btw", titel: "Btw-aangifte", sub: "Staat klaar, jij hoeft alleen over te nemen", woorden: "omzetbelasting aangifte rubriek icp kor kwartaal grootboek" },
    { pad: "/ib", titel: "Inkomstenbelasting", sub: "Wat je ongeveer moet betalen over je winst", woorden: "inkomstenbelasting winst aftrek zelfstandigenaftrek ib" },
    { pad: "/activa", titel: "Dure aankopen", sub: "Laptop, bus, machine: wordt over jaren verdeeld", woorden: "activa afschrijving investering kia bedrijfsmiddel laptop grote aankopen" },
    { pad: "/jaarrekening", titel: "Jaaroverzicht", sub: "Je winst en wat je bezit, per jaar", woorden: "jaarrekening grootboek grootboeken balans winst-en-verlies resultaat kengetallen eigen vermogen" },
    { pad: "/exports", titel: "Voor je boekhouder", sub: "Alles downloaden als Excel of PDF", woorden: "export download excel xaf auditfile sbr xbrl pdf zip boekhouder downloaden" },
  ] },
  { kop: "Bank en koppelingen", items: [
    { pad: "/koppelingen", titel: "Bank en apps koppelen", sub: "Je bank, Mollie, Stripe, Shopify en meer", woorden: "bank psd2 ing rabobank mollie stripe shopify whatsapp e-mail bonnen koppelingen" },
    { pad: "/rekeningen", titel: "Bankrekeningen", sub: "Welke rekeningen gekoppeld zijn", woorden: "bankrekening iban saldo rekeningen" },
    { pad: "/importeren", titel: "Overstappen", sub: "Je oude boekhouding meenemen", woorden: "import overstappen moneybird e-boekhouden jortt excel paypal" },
  ] },
  { kop: "Hulp en instellingen", items: [
    { pad: "/assistent", titel: "Vraag het Saldoplan", sub: "Stel een vraag over je eigen cijfers", woorden: "ai chat vraag assistent hulp" },
    { pad: "/meldingen", titel: "Te doen en herinneringen", sub: "Wat er moet gebeuren en wanneer", woorden: "taken deadline herinnering notificatie meldingen" },
    { pad: "/zoeken", titel: "Zoeken", sub: "Een betaling, factuur, klant of bon vinden", woorden: "zoek transactie bon factuur" },
    { pad: "/instellingen", titel: "Instellingen", sub: "Je bedrijf, je logo, je team", woorden: "bedrijf kvk btw-nummer huisstijl logo team abonnement account tweestap beveiliging" },
    { pad: "/logboek", titel: "Wie deed wat", sub: "Alle wijzigingen op een rij", woorden: "log geschiedenis activiteit logboek" },
    { pad: "/feedback", titel: "Iets melden", sub: "Een fout of een idee doorgeven", woorden: "feedback fout melden suggestie" },
  ] },
];

/** Meer: alles wat niet in de vier hoofdtabbladen zit, plus je account. */
export default function Meer() {
  const k = useKleuren();
  const { account, uitloggen, ververs: verversAccount } = useAuth();
  const { data } = useAccount();
  const ververs = useVervers();
  const wissel = async (id: string) => {
    if (id === data?.onderneming.id) return;
    await api("/api/mobiel/account", { body: { ondernemingId: id } });
    await verversAccount();
    await ververs();
  };
  const [zoek, setZoek] = useState("");
  const term = zoek.trim().toLowerCase();
  const past = (it: { titel: string; sub: string; woorden?: string }) => !term || `${it.titel} ${it.sub} ${it.woorden ?? ""}`.toLowerCase().includes(term);
  const groepen = GROEPEN.map((g) => ({ ...g, items: g.items.filter(past) })).filter((g) => g.items.length > 0);
  return (
    <Scherm>
      <Kop titel="Meer" />
      <Veld placeholder="Waar ben je naar op zoek?" value={zoek} onChangeText={setZoek} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" onSubmitEditing={() => { if (term && groepen.length === 0) ga("/zoeken", { q: zoek.trim() }); }} />
      {term && groepen.length === 0 && (
        <Kaart>
          <Tekst kleur="2">Geen onderdeel heet zo.</Tekst>
          <Knop tekst={`Zoek "${zoek.trim()}" in je administratie`} soort="licht" klein onPress={() => ga("/zoeken", { q: zoek.trim() })} />
        </Kaart>
      )}
      {!term && <Kaart>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: k.primairLicht, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: k.primairTekst, fontWeight: "700" }}>{(account?.gebruiker.email ?? "?").slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{data?.onderneming.naam ?? account?.onderneming?.naam ?? "Mijn onderneming"}</Text>
            <Text style={{ color: k.tekst2, fontSize: 13 }} numberOfLines={1}>{account?.gebruiker.email}</Text>
          </View>
          {data && <Pil kleur={data.abonnement.toegang ? "groen" : "rood"}>{data.abonnement.tekst}</Pil>}
        </View>
        {data && data.ondernemingen.length > 1 && <Kies label="Onderneming" waarde={data.onderneming.id} opties={data.ondernemingen.map((o) => ({ k: o.id, l: o.naam, sub: o.rol }))} onChange={wissel} />}
        {data?.schrijfFout && <Tekst kleur="2" soort="klein">{data.schrijfFout}</Tekst>}
      </Kaart>}
      {!term && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {VAAK.map((v) => (
            <Pressable key={v.pad} onPress={() => ga(v.pad)} accessibilityRole="button" accessibilityLabel={v.titel}
              style={({ pressed }) => ({ flexBasis: "30%", flexGrow: 1, alignItems: "center", gap: 10, paddingVertical: 18, borderRadius: 20, backgroundColor: k.wit, opacity: pressed ? 0.7 : 1 })}>
              <Symbool name={v.sf} tintColor={k.tekst} size={22} weight="medium" />
              <Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600" }}>{v.titel}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {groepen.map((g) => (
        <View key={g.kop} style={{ gap: 8 }}>
          <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "700", marginLeft: 4 }}>{g.kop}</Text>
          <Kaart strak>{g.items.map((it, i) => <Rij key={it.pad} titel={it.titel} sub={it.sub} onPress={() => ga(it.pad)} laatste={i === g.items.length - 1} />)}</Kaart>
        </View>
      ))}
      {!term && <Knop tekst="Uitloggen" soort="licht" onPress={() => Alert.alert("Uitloggen", "Je blijft op andere apparaten ingelogd.", [{ text: "Annuleren", style: "cancel" }, { text: "Uitloggen", style: "destructive", onPress: () => void uitloggen() }])} />}
      <Text style={{ color: k.tekst3, fontSize: 12, textAlign: "center" }}>Saldoplan voor iPhone · dezelfde boekhouding als op app.saldoplan.nl</Text>
    </Scherm>
  );
}
