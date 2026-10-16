import { Linking } from "react-native";
import { useInstellingen } from "@/lib/instellingen";
import { useMeta } from "@/lib/queries";
import { ga } from "@/lib/navigatie";
import { datumNl } from "@/lib/format";
import { Kaart, Kop, Laden, Pil, Rij, Scherm, Tekst } from "@/components/ui";

/** Instellingen: dezelfde onderdelen als de webapp. */
export default function Instellingen() {
  const { data, isLoading, refetch } = useInstellingen();
  const meta = useMeta();
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  const items = [
    { pad: "/instellingen/bedrijf", titel: "Bedrijf", sub: [data.bedrijf.naam, data.bedrijf.kvk ? `KvK ${data.bedrijf.kvk}` : "KvK ontbreekt", data.bedrijf.iban ? "IBAN ingevuld" : "IBAN ontbreekt"].join(" · ") },
    { pad: "/instellingen/facturen", titel: "Facturen", sub: `Nummering ${data.facturen.factuurPrefix || "zonder prefix"}, betaaltermijn ${data.facturen.betaaltermijn} dagen, herinneringen ${data.facturen.herinneringAuto ? "automatisch" : "handmatig"}` },
    { pad: "/instellingen/huisstijl", titel: "Huisstijl", sub: `Lay-out ${data.huisstijl.layout}, kleur ${data.huisstijl.kleur}${data.huisstijl.heeftLogo ? ", met logo" : ", zonder logo"}` },
    { pad: "/instellingen/belasting", titel: "Belasting", sub: `Btw per ${data.fiscaal.btwTijdvak}${data.fiscaal.korDeelnemer ? ", KOR" : ""}${data.fiscaal.urencriterium ? ", urencriterium" : ""}` },
    { pad: "/instellingen/team", titel: "Team", sub: `${data.team.length} ${data.team.length === 1 ? "persoon" : "personen"}` },
    { pad: "/instellingen/account", titel: "Inloggen en beveiliging", sub: `${data.account.email}${data.account.totpAan ? " · tweestap aan" : ""}` },
  ];
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Instellingen" />
      <Kaart strak>{items.map((it, i) => <Rij key={it.pad} titel={it.titel} sub={it.sub} onPress={() => ga(it.pad)} laatste={i === items.length - 1} />)}</Kaart>
      <Kaart titel="Abonnement" actie={<Pil kleur={data.abonnement.toegang ? "groen" : "rood"}>{data.abonnement.tekst}</Pil>}>
        <Tekst kleur="2" soort="klein">€ 50 per maand zonder btw, elke maand opzegbaar.{data.abonnement.proefTot && data.abonnement.status === "proef" ? ` Proef tot ${datumNl(data.abonnement.proefTot)}.` : ""}</Tekst>
        <Tekst kleur="2" soort="klein">Starten, betaalgegevens wijzigen of opzeggen doe je in de webapp onder Instellingen, Abonnement.</Tekst>
        <Rij titel="Open de webapp" onPress={() => Linking.openURL(`${meta.data?.appUrl ?? "https://app.saldoplan.nl"}/app/instellingen?tab=abonnement`)} laatste />
        {data.abonnement.verwijscode && <Tekst kleur="3" soort="klein">Jouw uitnodigingslink: {meta.data?.appUrl ?? "https://app.saldoplan.nl"}/login?ref={data.abonnement.verwijscode}</Tekst>}
      </Kaart>
      <Tekst kleur="3" soort="klein" style={{ textAlign: "center" }}>De onderneming verwijderen kan alleen in de webapp.</Tekst>
    </Scherm>
  );
}
