import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useFacturen } from "@/lib/queries";
import { euro, euroHeel, datumKort, dagenTussen } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import { Chips, Cijferband, Kaart, Knop, Kop, Laden, Pil, Rij, Scherm, Tegel, Tekst, Veld, useKleuren } from "@/components/ui";

const FILTERS = [{ k: "alle", l: "Alles" }, { k: "open", l: "Open" }, { k: "telaat", l: "Te laat" }, { k: "concept", l: "Concept" }, { k: "betaald", l: "Betaald" }];

/** Facturen: overzicht, filters en snel naar een nieuwe factuur. */
export default function Facturen() {
  const k = useKleuren();
  const sp = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState(FILTERS.some((f) => f.k === sp.filter) ? sp.filter! : "alle");
  const [q, setQ] = useState("");
  const [zoek, setZoek] = useState("");
  const { data, isLoading, refetch } = useFacturen(`?filter=${filter}${zoek ? `&q=${encodeURIComponent(zoek)}` : ""}`);
  const nu = new Date();
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Facturen" sub="Met iDEAL-link. Saldoplan volgt de betaling en herinnert zelf.">
        <Knop tekst="Nieuwe factuur" klein onPress={() => ga("/factuur/nieuw")} />
        <Knop tekst="Offertes" klein soort="licht" onPress={() => ga("/offertes")} />
        <Knop tekst="Vaste facturen" klein soort="licht" onPress={() => ga("/terugkerend")} />
      </Kop>
      {data && (
        <Cijferband>
          <Tegel label="Open" waarde={euroHeel(data.tellers.openBedrag)} hint={`${data.tellers.open} ${data.tellers.open === 1 ? "factuur" : "facturen"}`} />
          <Tegel label="Te laat" waarde={String(data.tellers.teLaat)} hint="Saldoplan herinnert vanzelf" accent={data.tellers.teLaat ? "rood" : undefined} />
        </Cijferband>
      )}
      <Veld placeholder="Zoek op nummer, klant of referentie" value={q} onChangeText={setQ} onSubmitEditing={() => setZoek(q.trim())} onBlur={() => setZoek(q.trim())} returnKeyType="search" clearButtonMode="while-editing" />
      <Chips opties={FILTERS} waarde={filter} onChange={setFilter} />
      {isLoading ? <Laden /> : !data || data.facturen.length === 0 ? (
        <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>{filter === "alle" && !zoek ? "Nog geen facturen. Maak je eerste factuur; die staat binnen een minuut bij je klant." : "Geen facturen met dit filter."}</Tekst></Kaart>
      ) : (
        <Kaart strak>
          {data.facturen.map((f, i) => {
            const open = ["verzonden", "herinnerd", "aangemaand"].includes(f.status);
            const teLaat = open && new Date(f.vervaldatum) < nu;
            return (
              <Rij key={f.id} titel={`${f.klant ?? "Klant"} · ${f.nummer}`} sub={teLaat ? `${dagenTussen(f.vervaldatum, nu)} dagen te laat` : open ? `Vervalt ${datumKort(f.vervaldatum)}` : f.regels[0]?.omschrijving ?? ""}
                rechts={euro(f.totaal)} rechtsSub={datumKort(f.datum)} links={<Pil kleur={teLaat ? "rood" : STATUS_KLEUR[f.status] ?? "grijs"}>{f.soort === "credit" ? "Credit" : STATUS_TEKST[f.status] ?? f.status}</Pil>}
                onPress={() => ga("/factuur/[id]", { id: f.id })} laatste={i === data.facturen.length - 1} kleurRechts={f.status === "betaald" ? k.groenTekst : k.tekst} />
            );
          })}
        </Kaart>
      )}
    </Scherm>
  );
}
