import { useState } from "react";
import { Pressable, Text, View, useColorScheme } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { Symbool } from "@/components/symbool";
import { actie } from "@/lib/api";
import { euro, datumNl } from "@/lib/format";
import { useFacturen, useKlanten, useOffertes, useVervers } from "@/lib/queries";
import { useKleuren } from "@/components/ui";
import { Spinner, Vinkje } from "@/components/animaties";

/** Een voorstel van de assistent ("VOORSTEL: {...}"): iets aanmaken of versturen, pas na jouw bevestiging. */
export type Voorstel = { soort: string; velden: Record<string, unknown> };
export type VoorstelStatus = "bevestigd" | "geannuleerd";
export type Knopje = { tekst: string; pad: string; params?: Record<string, string> };

/** Haalt de VOORSTEL-regel uit een antwoord. Een regel die nog binnenkomt (onvolledige JSON) wordt alvast verborgen. */
export function splitsVoorstel(tekst: string): { tekst: string; voorstel: Voorstel | null } {
  let voorstel: Voorstel | null = null;
  const over: string[] = [];
  for (const r of tekst.split("\n")) {
    const t = r.trim();
    if (/^VOORSTEL:/i.test(t)) {
      try {
        const v = JSON.parse(t.slice(9).trim()) as Voorstel;
        if (v && typeof v.soort === "string" && v.velden && typeof v.velden === "object") voorstel = v;
      } catch { /* nog niet compleet of ongeldig: dan geen kaart */ }
    } else over.push(r);
  }
  const laatste = over[over.length - 1]?.trim() ?? "";
  if (laatste && laatste.length < 9 && "VOORSTEL:".startsWith(laatste.toUpperCase())) over.pop();
  return { tekst: over.join("\n").trim(), voorstel };
}

type Regel = { omschrijving?: string; aantal?: number; prijs?: number; btw?: number; eenheid?: string };
const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const isDatum = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const KOPPEN: Record<string, { titel: string; sf: SFSymbol; knop: string }> = {
  klant: { titel: "Nieuwe klant", sf: "person.badge.plus", knop: "Klant toevoegen" },
  factuur: { titel: "Nieuwe factuur", sf: "doc.text", knop: "Factuur maken" },
  offerte: { titel: "Nieuwe offerte", sf: "doc.plaintext", knop: "Offerte maken" },
  uren: { titel: "Uren schrijven", sf: "clock", knop: "Uren opslaan" },
  kilometers: { titel: "Rit toevoegen", sf: "car", knop: "Rit opslaan" },
  product: { titel: "Nieuw product", sf: "tag", knop: "Product toevoegen" },
  activum: { titel: "Grote aankoop", sf: "laptopcomputer", knop: "Toevoegen" },
  verzendFactuur: { titel: "Factuur verzenden", sf: "paperplane", knop: "Verzenden" },
  verzendOfferte: { titel: "Offerte verzenden", sf: "paperplane", knop: "Verzenden" },
};

const LABELS: Record<string, string> = {
  naam: "Naam", contactpersoon: "Contactpersoon", email: "E-mail", telefoon: "Telefoon", adres: "Adres", postcode: "Postcode", plaats: "Plaats", land: "Land",
  kvk: "KvK", btwNummer: "Btw-nummer", betaaltermijn: "Betaaltermijn", notities: "Notities", klant: "Klant", datum: "Datum", termijn: "Termijn", referentie: "Referentie",
  opmerking: "Opmerking", uren: "Uren", omschrijving: "Omschrijving", uurtarief: "Uurtarief", van: "Van", naar: "Naar", km: "Afstand", retour: "Retour", doel: "Doel",
  vervoer: "Vervoer", prijs: "Prijs", btw: "Btw", eenheid: "Eenheid", categorie: "Categorie", aanschafDatum: "Aanschafdatum", aanschafBedrag: "Aanschafbedrag",
  looptijdJaren: "Afschrijven", restwaarde: "Restwaarde", nummer: "Nummer", verzenden: "Meteen verzenden",
};
const VERVOER: Record<string, string> = { prive_auto: "Eigen auto", zakelijke_auto: "Zakelijke auto", ov: "Openbaar vervoer", fiets: "Fiets" };

/** Waarde leesbaar maken voor op de kaart. */
function toon(sleutel: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "Ja" : "Nee";
  const t = s(v);
  if (!t) return "";
  if (["prijs", "uurtarief", "aanschafBedrag", "restwaarde"].includes(sleutel)) return euro(n(v));
  if (sleutel === "btw") return `${t}%`;
  if (sleutel === "km") return `${t} km`;
  if (sleutel === "uren") return `${t} uur`;
  if (sleutel === "betaaltermijn" || sleutel === "termijn") return `${t} dagen`;
  if (sleutel === "looptijdJaren") return `${t} jaar`;
  if (sleutel === "vervoer") return VERVOER[t] ?? t;
  if ((sleutel === "datum" || sleutel === "aanschafDatum") && isDatum(t)) return datumNl(t);
  return t;
}

/** Kaart met het voorstel: wat er aangemaakt wordt, met Bevestig en Annuleer. Na bevestigen voert de app de server-actie uit. */
export function VoorstelKaart({ voorstel, status, actief, onKlaar }: {
  voorstel: Voorstel; status?: VoorstelStatus; actief: boolean;
  onKlaar: (status: VoorstelStatus, melding: string, fout?: boolean, knop?: Knopje) => void;
}) {
  const k = useKleuren();
  const donker = useColorScheme() === "dark";
  const ververs = useVervers();
  const { data: kd } = useKlanten("");
  const { data: fd } = useFacturen();
  const { data: od } = useOffertes();
  const [bezig, setBezig] = useState(false);
  const kop = KOPPEN[voorstel.soort];
  if (!kop) return null;
  const v = voorstel.velden;
  const regels = Array.isArray(v.regels) ? (v.regels as Regel[]) : [];
  const rijen = Object.entries(v).filter(([sleutel, w]) => sleutel !== "regels" && LABELS[sleutel] && toon(sleutel, w) !== "");
  const excl = regels.reduce((t, r) => t + n(r.aantal || 1) * n(r.prijs), 0);
  const btwTotaal = regels.reduce((t, r) => t + n(r.aantal || 1) * n(r.prijs) * (n(r.btw ?? 21) / 100), 0);
  const donkerVlak = donker ? k.primair : "#15181d";

  const vindKlant = (naam: string) => {
    const lijst = kd?.klanten ?? [];
    const l = naam.toLowerCase();
    return lijst.find((c) => c.naam.toLowerCase() === l) ?? lijst.find((c) => c.naam.toLowerCase().includes(l) || l.includes(c.naam.toLowerCase()));
  };
  const regelVelden = () => Object.fromEntries(regels.flatMap((r, i) => [[`oms${i}`, s(r.omschrijving)], [`aantal${i}`, String(n(r.aantal || 1))], [`prijs${i}`, String(n(r.prijs))], [`btw${i}`, String(r.btw ?? 21)], [`eenheid${i}`, s(r.eenheid)]]));

  const bevestig = async () => {
    setBezig(true);
    try {
      const soort = voorstel.soort;
      if (soort === "klant") {
        const r = await actie("klantOpslaan", { naam: s(v.naam), contactpersoon: s(v.contactpersoon), email: s(v.email), telefoon: s(v.telefoon), adres: s(v.adres), postcode: s(v.postcode), plaats: s(v.plaats), land: s(v.land) || "NL", kvk: s(v.kvk), btwNummer: s(v.btwNummer), betaaltermijn: s(v.betaaltermijn), notities: s(v.notities), isOndernemer: v.isOndernemer === false ? "nee" : "ja", isOndernemer_form: "1" });
        await ververs("klanten", "overzicht");
        return onKlaar("bevestigd", r.ok ? r.melding || `Klant ${s(v.naam)} toegevoegd.` : r.fout, !r.ok, r.ok && r.id ? { tekst: "Klant openen", pad: "/klant/[id]", params: { id: r.id } } : undefined);
      }
      if (soort === "factuur" || soort === "offerte") {
        const klant = vindKlant(s(v.klant));
        const r = await actie(soort === "factuur" ? "factuurOpslaan" : "offerteOpslaan", {
          ...(klant ? { klantId: klant.id } : { klantId: "nieuw", klantNaam: s(v.klant), klantEmail: s(v.klantEmail) }),
          datum: isDatum(s(v.datum)) ? s(v.datum) : "", termijn: s(v.termijn), referentie: s(v.referentie), opmerking: s(v.opmerking), ...regelVelden(),
          ...(v.verzenden === true ? { actie: "verzenden" } : {}),
        });
        await ververs("facturen", "offertes", "overzicht", "klanten");
        const pad = soort === "factuur" ? "/factuur/[id]" : "/offerte/[id]";
        return onKlaar("bevestigd", r.ok ? r.melding : r.fout, !r.ok, r.ok && r.id ? { tekst: soort === "factuur" ? "Factuur openen" : "Offerte openen", pad, params: { id: r.id } } : undefined);
      }
      if (soort === "uren") {
        const klant = s(v.klant) ? vindKlant(s(v.klant)) : undefined;
        const r = await actie("urenToevoegen", { datum: isDatum(s(v.datum)) ? s(v.datum) : new Date().toISOString().slice(0, 10), uren: String(n(v.uren)), omschrijving: s(v.omschrijving), klantId: klant?.id ?? "", uurtarief: s(v.uurtarief), soort: "declarabel" });
        await ververs("uren", "overzicht");
        return onKlaar("bevestigd", r.ok ? `${n(v.uren)} uur geschreven${klant ? ` voor ${klant.naam}` : ""}.` : r.fout, !r.ok, r.ok ? { tekst: "Uren bekijken", pad: "/uren" } : undefined);
      }
      if (soort === "kilometers") {
        const r = await actie("kilometersToevoegen", { datum: isDatum(s(v.datum)) ? s(v.datum) : new Date().toISOString().slice(0, 10), van: s(v.van), naar: s(v.naar), km: String(n(v.km)), retour: v.retour === true || s(v.retour) === "ja" ? "ja" : "nee", doel: s(v.doel), vervoer: s(v.vervoer) || "prive_auto" });
        await ververs("kilometers", "overzicht");
        return onKlaar("bevestigd", r.ok ? `Rit ${s(v.van)} – ${s(v.naar)} (${n(v.km)} km) toegevoegd.` : r.fout, !r.ok, r.ok ? { tekst: "Ritten bekijken", pad: "/kilometers" } : undefined);
      }
      if (soort === "product") {
        const r = await actie("productOpslaan", { naam: s(v.naam), omschrijving: s(v.omschrijving), prijs: String(n(v.prijs)), btw: String(v.btw ?? 21), eenheid: s(v.eenheid) || "stuk" });
        await ververs("producten");
        return onKlaar("bevestigd", r.ok ? `Product ${s(v.naam)} toegevoegd.` : r.fout, !r.ok, r.ok ? { tekst: "Producten", pad: "/producten" } : undefined);
      }
      if (soort === "activum") {
        const r = await actie("activumToevoegen", { naam: s(v.naam), categorie: s(v.categorie) || "inventaris", aanschafDatum: isDatum(s(v.aanschafDatum)) ? s(v.aanschafDatum) : new Date().toISOString().slice(0, 10), aanschafBedrag: String(n(v.aanschafBedrag)), looptijdJaren: String(n(v.looptijdJaren) || 5), restwaarde: String(n(v.restwaarde)), priveDeel: String(n(v.priveDeel)) });
        await ververs("activa", "overzicht");
        return onKlaar("bevestigd", r.ok ? `${s(v.naam)} staat bij je grote aankopen.` : r.fout, !r.ok, r.ok ? { tekst: "Grote aankopen", pad: "/activa" } : undefined);
      }
      if (soort === "verzendFactuur" || soort === "verzendOfferte") {
        const nummer = s(v.nummer);
        const doel = soort === "verzendFactuur" ? (fd?.facturen ?? []).find((f) => f.nummer === nummer) : (od?.offertes ?? []).find((o) => o.nummer === nummer);
        if (!doel) return onKlaar("bevestigd", `${soort === "verzendFactuur" ? "Factuur" : "Offerte"} ${nummer} kan ik niet vinden.`, true);
        const r = await actie(soort === "verzendFactuur" ? "factuurVerzenden" : "offerteVerzenden", { id: doel.id });
        await ververs("facturen", "offertes", "overzicht");
        return onKlaar("bevestigd", r.ok ? `${soort === "verzendFactuur" ? "Factuur" : "Offerte"} ${nummer} verzonden.` : r.fout, !r.ok, r.ok ? { tekst: "Openen", pad: soort === "verzendFactuur" ? "/factuur/[id]" : "/offerte/[id]", params: { id: doel.id } } : undefined);
      }
      onKlaar("bevestigd", "Dit soort voorstel ken ik nog niet.", true);
    } catch (e) {
      onKlaar("bevestigd", e instanceof Error ? e.message : "Dat lukte niet.", true);
    } finally {
      setBezig(false);
    }
  };

  return (
    <View style={{ marginTop: 10, maxWidth: "94%", alignSelf: "flex-start", width: 340, backgroundColor: k.wit, borderRadius: 20, overflow: "hidden", borderWidth: 0.5, borderColor: k.lijn }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: donkerVlak, alignItems: "center", justifyContent: "center" }}>
          <Symbool name={kop.sf} tintColor="#fff" size={15} weight="semibold" />
        </View>
        <Text style={{ flex: 1, color: k.tekst, fontSize: 16, fontWeight: "700" }}>{kop.titel}</Text>
        {status === "bevestigd" ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Vinkje kleur="#fff" achter={k.groen} maat={20} rond /><Text style={{ color: k.groenTekst, fontSize: 13, fontWeight: "600" }}>Gedaan</Text></View> : status ? <Text style={{ color: k.tekst3, fontSize: 13, fontWeight: "600" }}>Geannuleerd</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6 }}>
        {rijen.map(([sleutel, w]) => (
          <View key={sleutel} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ color: k.tekst3, fontSize: 14 }}>{LABELS[sleutel]}</Text>
            <Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" }} numberOfLines={2}>{toon(sleutel, w)}</Text>
          </View>
        ))}
        {regels.length > 0 && (
          <View style={{ marginTop: 4, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 8, gap: 6 }}>
            {regels.map((r, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ color: k.tekst, fontSize: 14, flex: 1 }} numberOfLines={2}>{s(r.omschrijving)}{n(r.aantal || 1) !== 1 ? ` × ${n(r.aantal)}` : ""}</Text>
                <Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{euro(n(r.aantal || 1) * n(r.prijs))}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
              <Text style={{ color: k.tekst3, fontSize: 13 }}>Excl. btw {euro(excl)}</Text>
              <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{euro(excl + btwTotaal)}</Text>
            </View>
          </View>
        )}
      </View>
      {actief && !status && (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
          <Pressable onPress={() => onKlaar("geannuleerd", "Geannuleerd, er is niets aangemaakt.")} disabled={bezig} accessibilityRole="button"
            style={({ pressed }) => ({ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: k.papier, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>Annuleer</Text>
          </Pressable>
          <Pressable onPress={bevestig} disabled={bezig} accessibilityRole="button"
            style={({ pressed }) => ({ flex: 1.4, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: donkerVlak, opacity: pressed || bezig ? 0.7 : 1 })}>
            {bezig ? <Spinner kleur="#fff" maat={18} /> : <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{kop.knop}</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}
