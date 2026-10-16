import { Alert, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAccount, useVervers } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Kop, Pil, Rij, Scherm, Tekst, useKleuren } from "@/components/ui";

const GROEPEN: { kop: string; items: { pad: string; titel: string; sub: string }[] }[] = [
  { kop: "Verkoop", items: [
    { pad: "/offertes", titel: "Offertes", sub: "Je klant tekent online" },
    { pad: "/klanten", titel: "Klanten", sub: "Wie wat open heeft staan" },
    { pad: "/producten", titel: "Producten", sub: "Vaste regels voor op je facturen" },
    { pad: "/terugkerend", titel: "Vaste facturen", sub: "Abonnementen en maandbedragen" },
    { pad: "/uren", titel: "Uren", sub: "Urencriterium en uren naar factuur" },
    { pad: "/kilometers", titel: "Kilometers", sub: "€ 0,23 per kilometer" },
  ] },
  { kop: "Belasting", items: [
    { pad: "/btw", titel: "Btw-aangifte", sub: "Alle rubrieken staan klaar" },
    { pad: "/ib", titel: "Inkomstenbelasting", sub: "Indicatie en wat je opzij zet" },
    { pad: "/activa", titel: "Grote aankopen", sub: "Afschrijven en investeringsaftrek" },
    { pad: "/jaarrekening", titel: "Jaaroverzicht", sub: "Winst-en-verlies en balans" },
    { pad: "/exports", titel: "Downloaden", sub: "Excel, auditfile, PDF's" },
  ] },
  { kop: "Saldoplan", items: [
    { pad: "/assistent", titel: "Vraag het Saldoplan", sub: "Chat over je eigen cijfers" },
    { pad: "/meldingen", titel: "Meldingen en taken", sub: "Deadlines en herinneringen" },
    { pad: "/zoeken", titel: "Zoeken", sub: "Betalingen, facturen, klanten, bonnen" },
    { pad: "/koppelingen", titel: "Koppelingen", sub: "Bank, Mollie, Stripe, Shopify en meer" },
    { pad: "/rekeningen", titel: "Rekeningen", sub: "Je bankrekeningen" },
    { pad: "/importeren", titel: "Overstappen", sub: "Uit Moneybird, e-Boekhouden, Jortt, Excel" },
    { pad: "/logboek", titel: "Logboek", sub: "Wie deed wat" },
    { pad: "/instellingen", titel: "Instellingen", sub: "Bedrijf, facturen, huisstijl, team" },
    { pad: "/feedback", titel: "Feedback geven", sub: "Wat kan beter?" },
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
  return (
    <Scherm>
      <Kop titel="Meer" />
      <Kaart>
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
      </Kaart>
      {GROEPEN.map((g) => (
        <View key={g.kop} style={{ gap: 8 }}>
          <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginLeft: 4 }}>{g.kop.toUpperCase()}</Text>
          <Kaart strak>{g.items.map((it, i) => <Rij key={it.pad} titel={it.titel} sub={it.sub} onPress={() => ga(it.pad)} laatste={i === g.items.length - 1} />)}</Kaart>
        </View>
      ))}
      <Knop tekst="Uitloggen" soort="licht" onPress={() => Alert.alert("Uitloggen", "Je blijft op andere apparaten ingelogd.", [{ text: "Annuleren", style: "cancel" }, { text: "Uitloggen", style: "destructive", onPress: () => void uitloggen() }])} />
      <Text style={{ color: k.tekst3, fontSize: 12, textAlign: "center" }}>Saldoplan voor iPhone · dezelfde boekhouding als op app.saldoplan.nl</Text>
    </Scherm>
  );
}
