import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAccount, useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Kop, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

const GROEPEN: { kop: string; items: { pad: string; titel: string; sub: string; woorden?: string }[] }[] = [
  { kop: "Verkoop", items: [
    { pad: "/offertes", titel: "Offertes", sub: "Je klant tekent online", woorden: "offerte prijsopgave tekenen" },
    { pad: "/klanten", titel: "Klanten", sub: "Wie wat open heeft staan", woorden: "klant debiteur relatie adres" },
    { pad: "/producten", titel: "Producten", sub: "Vaste regels voor op je facturen", woorden: "product dienst tarief prijslijst" },
    { pad: "/terugkerend", titel: "Vaste facturen", sub: "Abonnementen en maandbedragen", woorden: "abonnement herhalen terugkerend" },
    { pad: "/uren", titel: "Uren", sub: "Urencriterium en uren naar factuur", woorden: "urenregistratie urencriterium declarabel agenda" },
    { pad: "/kilometers", titel: "Kilometers", sub: "€ 0,23 per kilometer", woorden: "rit reiskosten auto fiets" },
  ] },
  { kop: "Belasting", items: [
    { pad: "/btw", titel: "Btw-aangifte", sub: "Alle rubrieken staan klaar", woorden: "omzetbelasting aangifte rubriek icp kor kwartaal grootboek" },
    { pad: "/ib", titel: "Inkomstenbelasting", sub: "Indicatie en wat je opzij zet", woorden: "inkomstenbelasting winst aftrek zelfstandigenaftrek" },
    { pad: "/activa", titel: "Grote aankopen", sub: "Afschrijven en investeringsaftrek", woorden: "activa afschrijving investering kia bedrijfsmiddel laptop" },
    { pad: "/jaarrekening", titel: "Jaaroverzicht", sub: "Winst-en-verlies en balans", woorden: "jaarrekening grootboek grootboeken balans winst-en-verlies resultaat kengetallen eigen vermogen" },
    { pad: "/exports", titel: "Downloaden", sub: "Excel, auditfile, PDF's", woorden: "export download excel xaf auditfile sbr xbrl pdf zip boekhouder" },
  ] },
  { kop: "Saldoplan", items: [
    { pad: "/assistent", titel: "Vraag het Saldoplan", sub: "Chat over je eigen cijfers", woorden: "ai chat vraag assistent" },
    { pad: "/meldingen", titel: "Meldingen en taken", sub: "Deadlines en herinneringen", woorden: "taken deadline herinnering notificatie" },
    { pad: "/zoeken", titel: "Zoeken", sub: "Betalingen, facturen, klanten, bonnen", woorden: "zoek transactie bon factuur" },
    { pad: "/koppelingen", titel: "Koppelingen", sub: "Bank, Mollie, Stripe, Shopify en meer", woorden: "bank psd2 ing rabobank mollie stripe shopify whatsapp e-mail bonnen" },
    { pad: "/rekeningen", titel: "Rekeningen", sub: "Je bankrekeningen", woorden: "bankrekening iban saldo" },
    { pad: "/importeren", titel: "Overstappen", sub: "Uit Moneybird, e-Boekhouden, Jortt, Excel", woorden: "import overstappen moneybird e-boekhouden jortt excel paypal" },
    { pad: "/logboek", titel: "Logboek", sub: "Wie deed wat", woorden: "log geschiedenis activiteit" },
    { pad: "/instellingen", titel: "Instellingen", sub: "Bedrijf, facturen, huisstijl, team", woorden: "bedrijf kvk btw-nummer huisstijl logo team abonnement account tweestap beveiliging" },
    { pad: "/feedback", titel: "Feedback geven", sub: "Wat kan beter?", woorden: "feedback fout melden suggestie" },
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
      <Veld placeholder="Zoek een onderdeel, bijvoorbeeld grootboek of btw" value={zoek} onChangeText={setZoek} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" onSubmitEditing={() => { if (term && groepen.length === 0) ga("/zoeken", { q: zoek.trim() }); }} />
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
      {groepen.map((g) => (
        <View key={g.kop} style={{ gap: 8 }}>
          <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginLeft: 4 }}>{g.kop.toUpperCase()}</Text>
          <Kaart strak>{g.items.map((it, i) => <Rij key={it.pad} titel={it.titel} sub={it.sub} onPress={() => ga(it.pad)} laatste={i === g.items.length - 1} />)}</Kaart>
        </View>
      ))}
      {!term && <Knop tekst="Uitloggen" soort="licht" onPress={() => Alert.alert("Uitloggen", "Je blijft op andere apparaten ingelogd.", [{ text: "Annuleren", style: "cancel" }, { text: "Uitloggen", style: "destructive", onPress: () => void uitloggen() }])} />}
      <Text style={{ color: k.tekst3, fontSize: 12, textAlign: "center" }}>Saldoplan voor iPhone · dezelfde boekhouding als op app.saldoplan.nl</Text>
    </Scherm>
  );
}
