import { useState } from "react";
import { Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { api, actie, bestandVeld } from "@/lib/api";
import { useVervers, useVragen } from "@/lib/queries";
import { euro, datumKort } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import type { Transactie } from "@/lib/types";
import { Vragen } from "@/components/vragen";
import { Chips, Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Veld, useKleuren } from "@/components/ui";
import { useLocalSearchParams } from "expo-router";

type Antwoord = { regels: Transactie[]; totaal: number; perPagina: number; pagina: number; tellers: { open: number; twijfel: number } };
const FILTERS = [{ k: "alle", l: "Alles" }, { k: "twijfel", l: "Twijfel" }, { k: "open", l: "Nog niet beoordeeld" }, { k: "prive", l: "Privé" }, { k: "zonderbon", l: "Kosten zonder bon" }] as const;
type Filter = (typeof FILTERS)[number]["k"];

export const statusVan = (t: Transactie): { kleur: "groen" | "geel" | "rood" | "grijs"; tekst: string } =>
  t.zakelijk === null ? { kleur: "grijs", tekst: "Nieuw" } : !t.bevestigd ? { kleur: "geel", tekst: "Twijfel" } : t.zakelijk ? { kleur: "groen", tekst: "Geboekt" } : { kleur: "grijs", tekst: "Privé" };

/** Bank: alle betalingen met dezelfde filters als de webapp; elke regel heeft een uitleg, bij twijfel beslis jij. */
export default function Bank() {
  const k = useKleuren();
  const sp = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>((FILTERS.some((f) => f.k === sp.filter) ? sp.filter : "alle") as Filter);
  const [q, setQ] = useState("");
  const [zoek, setZoek] = useState("");
  const [melding, setMelding] = useState<{ soort: "fout" | "ok"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const ververs = useVervers();
  const vragen = useVragen();
  const pad = (p: number) => `/api/mobiel/transacties?filter=${filter}&pagina=${p}${zoek ? `&q=${encodeURIComponent(zoek)}` : ""}`;
  const lijst = useInfiniteQuery<Antwoord>({
    queryKey: ["transacties", filter, zoek],
    queryFn: ({ pageParam }) => api<Antwoord>(pad(pageParam as number)),
    initialPageParam: 1,
    getNextPageParam: (laatste) => (laatste.pagina * laatste.perPagina < laatste.totaal ? laatste.pagina + 1 : undefined),
  });
  const regels = lijst.data?.pages.flatMap((p) => p.regels) ?? [];
  const tellers = lijst.data?.pages[0]?.tellers;
  const totaal = lijst.data?.pages[0]?.totaal ?? 0;

  const doe = async (naam: string, tekst: string) => {
    setBezig(naam); setMelding(null);
    try { const r = await actie(naam); setMelding(r.ok ? { soort: "ok", tekst: r.melding || tekst } : { soort: "fout", tekst: r.fout }); await ververs("transacties", "vragen", "overzicht"); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  const importeer = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/plain", "application/xml", "text/xml", "application/octet-stream", "*/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setBezig("import"); setMelding(null);
    try {
      const fd = new FormData();
      fd.append("naam", "importeerBestand");
      fd.append("bestand", bestandVeld(a.uri, a.name, a.mimeType ?? "text/csv"));
      const uit = await api<{ ok: boolean; melding?: string; fout?: string }>("/api/mobiel/actie", { form: fd });
      setMelding(uit.ok ? { soort: "ok", tekst: uit.melding ?? "Bestand ingelezen." } : { soort: "fout", tekst: uit.fout ?? "Inlezen lukte niet." });
      await ververs("transacties", "overzicht", "rekeningen");
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Inlezen lukte niet." }); }
    finally { setBezig(null); }
  };

  return (
    <Scherm ververs={() => Promise.all([lijst.refetch(), vragen.refetch()])}>
      <Kop titel="Bank" sub="Elke regel wordt geboekt met een uitleg. Bij twijfel beslis jij.">
        {(tellers?.open ?? 0) > 0 && <Knop klein soort="licht" tekst={`${tellers!.open} ${tellers!.open === 1 ? "betaling" : "betalingen"} laten boeken`} bezig={bezig === "beoordeelOpenstaand"} onPress={() => doe("beoordeelOpenstaand", "Saldoplan heeft de open betalingen geboekt.")} />}
        {(tellers?.twijfel ?? 0) > 0 && <Knop klein soort="licht" tekst="Alles goedkeuren" bezig={bezig === "bevestigAlles"} onPress={() => doe("bevestigAlles", "Alle voorstellen zijn goedgekeurd.")} />}
        <Knop klein soort="licht" tekst="Bankbestand inlezen" bezig={bezig === "import"} onPress={importeer} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      {vragen.data && <Vragen vragen={vragen.data.vragen} />}
      <Veld placeholder="Zoek op naam of omschrijving" value={q} onChangeText={setQ} onSubmitEditing={() => setZoek(q.trim())} returnKeyType="search" clearButtonMode="while-editing" onBlur={() => setZoek(q.trim())} />
      <Chips opties={FILTERS.map((f) => ({ k: f.k, l: f.k === "twijfel" && tellers?.twijfel ? `Twijfel (${tellers.twijfel})` : f.k === "open" && tellers?.open ? `Nog niet beoordeeld (${tellers.open})` : f.l }))} waarde={filter} onChange={setFilter} />
      {lijst.isLoading ? <Laden /> : regels.length === 0 ? (
        <Kaart><Text style={{ color: k.tekst2, fontSize: 14, textAlign: "center" }}>{totaal === 0 && filter === "alle" && !zoek ? "Nog geen betalingen. Koppel je bank onder Koppelingen of lees een bankbestand in." : "Niets gevonden met dit filter."}</Text></Kaart>
      ) : (
        <Kaart strak>
          {regels.map((t, i) => {
            const s = statusVan(t);
            return <Rij key={t.id} titel={t.tegenpartij} sub={t.uitleg ?? t.omschrijving} rechts={euro(t.bedrag)} rechtsSub={datumKort(t.datum)} kleurRechts={t.bedrag > 0 ? k.groenTekst : k.tekst} links={<Pil kleur={s.kleur}>{s.tekst}</Pil>} onPress={() => ga("/transactie/[id]", { id: t.id })} laatste={i === regels.length - 1} />;
          })}
        </Kaart>
      )}
      {lijst.hasNextPage && <Knop tekst={`Meer laden (${regels.length} van ${totaal})`} soort="licht" bezig={lijst.isFetchingNextPage} onPress={() => lijst.fetchNextPage()} />}
      <View style={{ flexDirection: "row", gap: 8 }}><Knop tekst="Rekeningen" soort="tekst" klein onPress={() => ga("/rekeningen")} /><Knop tekst="Koppelingen" soort="tekst" klein onPress={() => ga("/koppelingen")} /></View>
    </Scherm>
  );
}
