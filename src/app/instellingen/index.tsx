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
      {/* Geen prijs en geen link naar een betaalpagina: Apple staat dat niet toe in een app (richtlijn 3.1.1). Alleen de status. */}
      <Kaart titel="Abonnement" actie={<Pil kleur={data.abonnement.toegang ? "groen" : "rood"}>{data.abonnement.tekst}</Pil>}>
        <Tekst kleur="2" soort="klein">{data.abonnement.proefTot && data.abonnement.status === "proef" ? `Proefperiode tot ${datumNl(data.abonnement.proefTot)}.` : data.abonnement.toegang ? "Je abonnement is actief." : "Je hebt op dit moment geen actief abonnement."}</Tekst>
        {data.abonnement.verwijscode && <Tekst kleur="3" soort="klein">Jouw uitnodigingslink: {meta.data?.appUrl ?? "https://app.saldoplan.nl"}/login?ref={data.abonnement.verwijscode}</Tekst>}
      </Kaart>
      <Rij titel="Account verwijderen" sub="Onderneming, gegevens en je inlogaccount definitief weg" onPress={() => ga("/instellingen/verwijderen")} laatste />
    </Scherm>
  );
}
