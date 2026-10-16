import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { euro, datumKort } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import type { Bon, Factuur, Klant, Offerte, Transactie } from "@/lib/types";
import { Kaart, Kop, Laden, Pil, Rij, Scherm, Tekst, Veld } from "@/components/ui";

type Antwoord = { transacties: Transactie[]; facturen: Factuur[]; offertes: Offerte[]; klanten: Klant[]; bonnen: Bon[] };

/** Zoeken door betalingen, facturen, offertes, klanten en bonnen. */
export default function Zoeken() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, isFetching } = useQuery({ queryKey: ["zoeken", term], queryFn: () => api<Antwoord>(`/api/mobiel/zoeken?q=${encodeURIComponent(term)}`), enabled: term.length > 0 });
  const totaal = data ? data.transacties.length + data.facturen.length + data.offertes.length + data.klanten.length + data.bonnen.length : 0;
  return (
    <Scherm>
      <Kop titel="Zoeken" sub="Een naam, factuurnummer, omschrijving of bedrag met komma, bijvoorbeeld 42,50." />
      <Veld placeholder="Zoeken" value={q} onChangeText={setQ} onSubmitEditing={() => setTerm(q.trim())} returnKeyType="search" autoFocus clearButtonMode="while-editing" />
      {isFetching && <Laden />}
      {term && data && totaal === 0 && <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Niets gevonden voor “{term}”.</Tekst></Kaart>}
      {data && data.facturen.length > 0 && <Kaart titel={`Facturen (${data.facturen.length})`} strak>{data.facturen.map((f, i) => <Rij key={f.id} titel={`${f.klant} · ${f.nummer}`} sub={datumKort(f.datum)} rechts={euro(f.totaal)} links={<Pil kleur={STATUS_KLEUR[f.status] ?? "grijs"}>{STATUS_TEKST[f.status] ?? f.status}</Pil>} onPress={() => ga("/factuur/[id]", { id: f.id })} laatste={i === data.facturen.length - 1} />)}</Kaart>}
      {data && data.transacties.length > 0 && <Kaart titel={`Betalingen (${data.transacties.length})`} strak>{data.transacties.map((t, i) => <Rij key={t.id} titel={t.tegenpartij} sub={t.omschrijving} rechts={euro(t.bedrag)} rechtsSub={datumKort(t.datum)} onPress={() => ga("/transactie/[id]", { id: t.id })} laatste={i === data.transacties.length - 1} />)}</Kaart>}
      {data && data.klanten.length > 0 && <Kaart titel={`Klanten (${data.klanten.length})`} strak>{data.klanten.map((c, i) => <Rij key={c.id} titel={c.naam} sub={[c.plaats, c.email].filter(Boolean).join(" · ") || null} onPress={() => ga("/klant/[id]", { id: c.id })} laatste={i === data.klanten.length - 1} />)}</Kaart>}
      {data && data.offertes.length > 0 && <Kaart titel={`Offertes (${data.offertes.length})`} strak>{data.offertes.map((x, i) => <Rij key={x.id} titel={`${x.klant} · ${x.nummer}`} rechts={euro(x.totaal)} onPress={() => ga("/offerte/[id]", { id: x.id })} laatste={i === data.offertes.length - 1} />)}</Kaart>}
      {data && data.bonnen.length > 0 && <Kaart titel={`Bonnen (${data.bonnen.length})`} strak>{data.bonnen.map((b, i) => <Rij key={b.id} titel={b.leverancier || b.bestandsnaam} sub={b.datum ? datumKort(b.datum) : null} rechts={b.totaal != null ? euro(b.totaal) : ""} onPress={() => ga("/bon/[id]", { id: b.id })} laatste={i === data.bonnen.length - 1} />)}</Kaart>}
    </Scherm>
  );
}
