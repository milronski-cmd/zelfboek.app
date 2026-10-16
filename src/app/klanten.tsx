import { useState } from "react";
import { useKlanten } from "@/lib/queries";
import { euro } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Laden, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

export default function Klanten() {
  const k = useKleuren();
  const [q, setQ] = useState("");
  const { data, isLoading, refetch } = useKlanten(q.trim());
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Klanten" sub="Wie wat open heeft staan en wat ze dit jaar opleverden.">
        <Knop tekst="Nieuwe klant" klein onPress={() => ga("/klant/nieuw")} />
      </Kop>
      <Veld placeholder="Zoek op naam" value={q} onChangeText={setQ} clearButtonMode="while-editing" />
      {isLoading ? <Laden /> : !data || data.klanten.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>{q ? "Geen klant met die naam." : "Nog geen klanten. Ze komen er vanzelf bij als je een factuur maakt."}</Tekst></Kaart> : (
        <Kaart strak>
          {data.klanten.map((c, i) => <Rij key={c.id} titel={c.naam} sub={[c.plaats, c.email].filter(Boolean).join(" · ") || null} rechts={c.open > 0 ? euro(c.open) : c.omzetJaar > 0 ? euro(c.omzetJaar) : ""} rechtsSub={c.open > 0 ? "open" : c.omzetJaar > 0 ? "dit jaar" : undefined} kleurRechts={c.open > 0 ? k.mosterdTekst : k.tekst} onPress={() => ga("/klant/[id]", { id: c.id })} laatste={i === data.klanten.length - 1} />)}
        </Kaart>
      )}
    </Scherm>
  );
}
