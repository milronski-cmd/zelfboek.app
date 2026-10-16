import { useOffertes } from "@/lib/queries";
import { euro, datumKort } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import { Kaart, Knop, Kop, Laden, Pil, Rij, Scherm, Tekst } from "@/components/ui";

export default function Offertes() {
  const { data, isLoading, refetch } = useOffertes();
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Offertes" sub="Je klant tekent online; met één klik wordt het een factuur.">
        <Knop tekst="Nieuwe offerte" klein onPress={() => ga("/offerte/nieuw")} />
      </Kop>
      {isLoading ? <Laden /> : !data || data.offertes.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Nog geen offertes.</Tekst></Kaart> : (
        <Kaart strak>
          {data.offertes.map((x, i) => (
            <Rij key={x.id} titel={`${x.klant ?? "Klant"} · ${x.nummer}`} sub={x.status === "verzonden" ? `Geldig tot ${datumKort(x.geldigTot)}` : x.regels[0]?.omschrijving ?? ""} rechts={euro(x.totaal)} rechtsSub={datumKort(x.datum)}
              links={<Pil kleur={STATUS_KLEUR[x.status] ?? "grijs"}>{STATUS_TEKST[x.status] ?? x.status}</Pil>} onPress={() => ga("/offerte/[id]", { id: x.id })} laatste={i === data.offertes.length - 1} />
          ))}
        </Kaart>
      )}
    </Scherm>
  );
}
